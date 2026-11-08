import { useSyncExternalStore } from "react";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { getKey } from "./aiKeys";
import type { ProviderConfig } from "./db";
import { ProviderError, NoProviderError, callWithRotation, type CooldownStore, type LlmRequest } from "./providers";

const COOLDOWN_KEY = "ece:aiCooldowns";
const COOLDOWN_EVENT = "ece:aiCooldowns";

/** Provider cooldowns survive a refresh, so a rate-limited provider is left alone for as long as it asked. */
export function localCooldowns(): CooldownStore {
  const read = (): Record<string, number> => {
    try {
      return JSON.parse(localStorage.getItem(COOLDOWN_KEY) ?? "{}") as Record<string, number>;
    } catch {
      return {};
    }
  };
  return {
    get: (id) => read()[id] ?? 0,
    set: (id, until) => {
      try {
        localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ ...read(), [id]: until }));
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event(COOLDOWN_EVENT));
    },
  };
}

/** Forget every cooldown, for example after a key or the provider list was changed. */
export function clearCooldowns(): void {
  try {
    localStorage.removeItem(COOLDOWN_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(COOLDOWN_EVENT));
}

function subscribeCooldowns(cb: () => void) {
  window.addEventListener(COOLDOWN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COOLDOWN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Re-renders the caller whenever any provider's cooldown changes. */
export function useCooldownVersion(): string {
  return useSyncExternalStore(
    subscribeCooldowns,
    () => {
      try {
        return localStorage.getItem(COOLDOWN_KEY) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
}

// ---------------------------------------------------------------------------------------------
// OpenAI-compatible providers
// ---------------------------------------------------------------------------------------------

interface ChatBody {
  model: string;
  messages: LlmRequest["messages"];
  temperature: number;
  max_tokens: number;
  reasoning_effort?: "low";
}

export function buildBody(p: ProviderConfig, r: LlmRequest, withEffort: boolean): ChatBody {
  const body: ChatBody = { model: p.model, messages: r.messages, temperature: r.temperature, max_tokens: r.maxTokens };
  // Groq's gpt-oss models think before they answer and count that against the limit. Ask them not to think long.
  if (withEffort && /^https:\/\/api\.groq\.com\//i.test(p.baseUrl) && /gpt-oss/i.test(p.model)) {
    body.reasoning_effort = "low";
  }
  return body;
}

const chatUrl = (p: ProviderConfig) => p.baseUrl.trim().replace(/\/+$/, "") + "/chat/completions";

/** Turns an OpenAI-style HTTP answer into text, or into an error that says what to do. */
export async function interpret(res: Response, p: ProviderConfig): Promise<string> {
  const raw = await res.text();
  let json: {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    error?: { message?: string };
  } | null = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  if (res.ok) {
    const choice = json?.choices?.[0];
    const content =
      typeof choice?.message?.content === "string"
        ? choice.message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
        : "";
    if (content) return content;
    if (choice?.finish_reason === "length") {
      throw new ProviderError(
        "bad_request",
        `${p.name}'s model ran out of room before it wrote an answer. It is probably a reasoning model that spends its budget thinking. Try a different model.`,
      );
    }
    throw new ProviderError("server", "The provider sent an empty answer.");
  }

  const detail = json?.error?.message ?? raw.slice(0, 200);
  if (res.status === 429) {
    const secs = Number(res.headers.get("retry-after"));
    throw new ProviderError("rate_limited", "The provider's rate limit was reached.", secs > 0 ? secs * 1000 : 60_000);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(
      "unauthorized",
      "The provider rejected the API key. Check that it is correct and still active.",
    );
  }
  if (res.status >= 500) throw new ProviderError("server", `The provider had a problem (${res.status}). ${detail}`);
  throw new ProviderError("bad_request", detail || `The provider answered ${res.status}.`);
}

class DirectBlocked extends Error {}

// Once a provider has refused a browser request, go straight to the relay next time instead of failing first.
const BLOCKED_KEY = "ece:aiBlockedHosts";
const blockedNow = new Set<string>();
const hostOf = (p: ProviderConfig) => p.baseUrl.trim().replace(/\/+$/, "");
function isBlocked(p: ProviderConfig): boolean {
  if (blockedNow.has(hostOf(p))) return true;
  try {
    return (JSON.parse(sessionStorage.getItem(BLOCKED_KEY) ?? "[]") as string[]).includes(hostOf(p));
  } catch {
    return false;
  }
}
function markBlocked(p: ProviderConfig): void {
  blockedNow.add(hostOf(p));
  try {
    const list = new Set(JSON.parse(sessionStorage.getItem(BLOCKED_KEY) ?? "[]") as string[]);
    list.add(hostOf(p));
    sessionStorage.setItem(BLOCKED_KEY, JSON.stringify([...list]));
  } catch {
    // ignore
  }
}

/** Straight from this browser to the provider. A failure to even connect usually means the provider blocks browser requests. */
async function direct(p: ProviderConfig, key: string, body: ChatBody): Promise<string> {
  let res: Response;
  try {
    res = await fetch(chatUrl(p), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DirectBlocked();
  }
  return interpret(res, p);
}

/**
 * Fallback for providers that refuse browser requests. The app's server passes the request along and keeps nothing:
 * the key is used for this one call and is not stored or logged.
 */
async function relay(p: ProviderConfig, key: string, body: ChatBody): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: p.baseUrl, apiKey: key, body }),
    });
  } catch {
    throw new ProviderError("network", "Could not reach the provider, directly or through the app's server.");
  }
  return interpret(res, p);
}

async function callOpenAI(p: ProviderConfig, r: LlmRequest): Promise<string> {
  const key = getKey(p.id);
  if (!key) throw new ProviderError("not_configured", `No API key has been added for ${p.name}.`);

  const attempt = async (withEffort: boolean) => {
    const body = buildBody(p, r, withEffort);
    if (isBlocked(p)) return relay(p, key, body);
    try {
      return await direct(p, key, body);
    } catch (e) {
      if (e instanceof DirectBlocked) {
        markBlocked(p);
        return relay(p, key, body);
      }
      throw e;
    }
  };
  try {
    return await attempt(true);
  } catch (e) {
    // If the provider rejects the "think less" setting, try once more without it.
    if (e instanceof ProviderError && e.kind === "bad_request" && buildBody(p, r, true).reasoning_effort)
      return attempt(false);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// The optional in-browser model
// ---------------------------------------------------------------------------------------------

let engine: MLCEngineInterface | null = null;
let engineModel = "";
let onProgress: ((text: string) => void) | null = null;

export function setWebLLMProgress(handler: ((text: string) => void) | null): void {
  onProgress = handler;
}

async function callWebLLM(p: ProviderConfig, r: LlmRequest): Promise<string> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    throw new ProviderError(
      "not_configured",
      "This browser has no WebGPU, which the in-browser model needs. Try Chrome or Edge.",
    );
  }
  try {
    if (!engine || engineModel !== p.model) {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      engine = await CreateMLCEngine(p.model, { initProgressCallback: (x) => onProgress?.(x.text) });
      engineModel = p.model;
    }
    const reply = await engine.chat.completions.create({
      messages: r.messages,
      temperature: r.temperature,
      max_tokens: r.maxTokens,
    });
    const content = reply.choices[0]?.message?.content;
    if (!content) throw new Error("empty answer");
    return content;
  } catch (e) {
    engine = null;
    throw new ProviderError(
      "server",
      `The in-browser model failed: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }
}

export function callProvider(p: ProviderConfig, r: LlmRequest): Promise<string> {
  return p.type === "webllm" ? callWebLLM(p, r) : callOpenAI(p, r);
}

/** A provider can be used if it needs no key, or if the user has added one. */
export function hasCredentials(p: ProviderConfig): boolean {
  return p.type === "webllm" || getKey(p.id) !== "";
}

/**
 * What the generator uses to talk to models: try providers in order, skipping any that are cooling down.
 * With no usable provider it fails fast, and the app simply keeps using the original questions.
 */
export function makeAsk(providers: ProviderConfig[]) {
  const cooldowns = localCooldowns();
  return (request: LlmRequest) => {
    const usable = providers.filter(hasCredentials);
    if (!providers.some((p) => p.enabled && hasCredentials(p))) {
      return Promise.reject(
        new NoProviderError(
          "No API key has been added, so quizzes keep using your original questions. Add a key to turn this on.",
          [],
        ),
      );
    }
    return callWithRotation({ providers: usable, request, call: callProvider, cooldowns });
  };
}
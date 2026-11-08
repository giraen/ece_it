import type { ProviderConfig } from "./db";

export type Purpose = "concept" | "frames" | "solve";

export interface LlmRequest {
  purpose: Purpose;
  messages: { role: "system" | "user"; content: string }[];
  temperature: number;
  maxTokens: number;
}

export type ProviderErrorKind =
  "rate_limited" | "server" | "network" | "unauthorized" | "not_configured" | "bad_request";

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  retryAfterMs?: number;
  constructor(kind: ProviderErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

export class NoProviderError extends Error {
  /** When the soonest provider may be tried again, if known. */
  retryAt?: number;
  reasons: string[];
  constructor(message: string, reasons: string[], retryAt?: number) {
    super(message);
    this.reasons = reasons;
    this.retryAt = retryAt;
  }
}

export interface CooldownStore {
  get(id: string): number;
  set(id: string, until: number): void;
}

export function memoryCooldowns(): CooldownStore {
  const m = new Map<string, number>();
  return { get: (id) => m.get(id) ?? 0, set: (id, until) => void m.set(id, until) };
}

const COOLDOWN_MS: Record<ProviderErrorKind, number> = {
  rate_limited: 60_000,
  server: 30_000,
  network: 30_000,
  // Setup mistakes are fixed by the user, not by waiting, so they only pause the provider briefly.
  unauthorized: 15_000,
  not_configured: 15_000,
  bad_request: 15_000,
};

/** Providers that may be tried now, in priority order. */
export function usableProviders(
  providers: ProviderConfig[],
  purpose: Purpose,
  nowMs: number,
  cooldowns: CooldownStore,
): ProviderConfig[] {
  return providers.filter(
    (p) => p.enabled && (!p.computationOnly || purpose === "frames") && cooldowns.get(p.id) <= nowMs,
  );
}

/**
 * Tries each provider in order. A provider that is rate limited or failing is put on a cooldown and the next one is tried.
 * Throws NoProviderError, with the soonest retry time, when none could answer.
 */
export async function callWithRotation(args: {
  providers: ProviderConfig[];
  request: LlmRequest;
  call: (p: ProviderConfig, r: LlmRequest) => Promise<string>;
  cooldowns: CooldownStore;
  now?: () => number;
}): Promise<{ content: string; provider: ProviderConfig }> {
  const now = args.now ?? Date.now;
  const reasons: string[] = [];
  const candidates = usableProviders(args.providers, args.request.purpose, now(), args.cooldowns);

  for (const p of candidates) {
    try {
      return { content: await args.call(p, args.request), provider: p };
    } catch (e) {
      const err =
        e instanceof ProviderError ? e : new ProviderError("network", e instanceof Error ? e.message : "failed");
      args.cooldowns.set(p.id, now() + (err.retryAfterMs ?? COOLDOWN_MS[err.kind]));
      reasons.push(`${p.name}: ${err.message}`);
    }
  }

  // Nothing worked now. Say when something might.
  const waiting = args.providers
    .filter((p) => p.enabled && (!p.computationOnly || args.request.purpose === "frames"))
    .map((p) => args.cooldowns.get(p.id))
    .filter((t) => t > now());
  const retryAt = waiting.length ? Math.min(...waiting) : undefined;
  const none = candidates.length === 0 && reasons.length === 0;
  throw new NoProviderError(
    none
      ? retryAt
        ? "Every provider is cooling down after a limit or error."
        : "No provider is enabled for this kind of request."
      : "No provider could answer.",
    reasons,
    retryAt,
  );
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "groq",
    name: "Groq",
    type: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    enabled: true,
    computationOnly: false,
  },
  {
    id: "webllm",
    name: "In-browser model",
    type: "webllm",
    baseUrl: "",
    model: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    enabled: false,
    computationOnly: true,
  },
];
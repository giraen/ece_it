import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A fallback relay for providers that do not allow requests straight from a browser (a CORS block).
 *
 * It holds no secrets and has no settings of its own. The caller sends their own API key with each request;
 * it is used for that one call and is never stored, logged, or returned.
 *
 * It only talks to a short list of known provider hosts. Optional, not secret: AI_ALLOWED_HOSTS adds more,
 * comma separated, for example "api.mistral.ai".
 */

const DEFAULT_HOSTS = ["api.groq.com", "openrouter.ai", "generativelanguage.googleapis.com"];
const MAX_BODY = 120_000;

function problem(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

function extraHosts(): string[] {
  return (process.env.AI_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostOk(url: URL): boolean {
  const extra = extraHosts();
  if (url.protocol === "https:") {
    return (
      DEFAULT_HOSTS.includes(url.hostname.toLowerCase()) ||
      extra.includes(url.host.toLowerCase()) ||
      extra.includes(url.hostname.toLowerCase())
    );
  }
  // Plain http is only for a localhost provider that was listed on purpose.
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return url.protocol === "http:" && local && extra.includes(url.host.toLowerCase());
}

interface Chat {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  max_tokens: number;
  reasoning_effort?: string;
}

function checkChat(b: Partial<Chat> | undefined): Chat | string {
  if (!b || typeof b.model !== "string" || !b.model || b.model.length > 200) return "Missing or bad model.";
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 10) return "Bad messages.";
  for (const m of b.messages) {
    if (!m || (m.role !== "system" && m.role !== "user") || typeof m.content !== "string" || m.content.length > 40_000)
      return "Bad messages.";
  }
  if (typeof b.temperature !== "number" || b.temperature < 0 || b.temperature > 2) return "Bad temperature.";
  if (!Number.isInteger(b.max_tokens) || (b.max_tokens as number) < 1 || (b.max_tokens as number) > 8000)
    return "Bad token limit.";
  if (b.reasoning_effort !== undefined && !["low", "medium", "high"].includes(b.reasoning_effort))
    return "Bad reasoning setting.";
  return b as Chat;
}

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) return problem(400, "The request is too large.");

  let input: { baseUrl?: unknown; apiKey?: unknown; body?: Partial<Chat> };
  try {
    input = JSON.parse(text);
  } catch {
    return problem(400, "The request is not valid JSON.");
  }
  const key = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!/^[A-Za-z0-9_\-.]{16,300}$/.test(key)) return problem(400, "The API key looks wrong.");
  if (typeof input.baseUrl !== "string") return problem(400, "Missing base URL.");

  let url: URL;
  try {
    url = new URL(input.baseUrl.trim().replace(/\/+$/, "") + "/chat/completions");
  } catch {
    return problem(400, "The base URL is not a valid address.");
  }
  if (!hostOk(url)) {
    return problem(
      400,
      `The host ${url.host} is not on this relay's list. Use a provider that allows browser requests, or ask for the host to be added.`,
    );
  }
  const chat = checkChat(input.body);
  if (typeof chat === "string") return problem(400, chat);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55_000);
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chat),
      signal: ctl.signal,
      cache: "no-store",
    });
    // Pass the provider's answer straight through, with the key blanked out in case it was echoed back.
    const out = (await upstream.text()).split(key).join("***");
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    const retry = upstream.headers.get("retry-after");
    if (retry) headers["Retry-After"] = retry;
    return new Response(out, { status: upstream.status, headers });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return problem(502, aborted ? "The provider took too long to answer." : "Could not reach the provider.");
  } finally {
    clearTimeout(timer);
  }
}
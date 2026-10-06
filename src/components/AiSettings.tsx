"use client";

import { useRef, useState } from "react";
import type { ProviderConfig } from "@/lib/db";
import { forgetAllKeys, forgetKey, readKeyFromText, setKey, setRemember, useKeyIds, useRemember } from "@/lib/aiKeys";
import { formatDateTime } from "@/lib/format";
import { useAttempts, useNow, useQuestions, useVariants } from "@/lib/hooks";
import { newId } from "@/lib/ids";
import { saveProviders, useProviders } from "@/lib/aiStore";
import { planTopUp, TARGET_UNSEEN } from "@/lib/generator";
import { clearCooldowns, localCooldowns, makeAsk, setWebLLMProgress, useCooldownVersion } from "@/lib/llmClient";
import { NoProviderError } from "@/lib/providers";
import { runGeneration, type RunControl, type RunEvent } from "@/lib/runGeneration";
import { servedVariantIds } from "@/lib/serve";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-line bg-surface p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function KeyField({ provider }: { provider: ProviderConfig }) {
  const saved = useKeyIds().includes(provider.id);
  const remember = useRemember();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  function save(text: string) {
    const key = readKeyFromText(text);
    if (!key) {
      setError("That does not look like an API key. Paste just the key, or choose a file that contains it.");
      return;
    }
    setKey(provider.id, key);
    clearCooldowns();
    setDraft("");
    setError(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-xs font-medium">API key</label>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="input font-mono"
            aria-label={`API key for ${provider.name || "this provider"}`}
            placeholder={saved ? "A key is saved. Paste a new one to replace it." : "Paste your key here"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) save(draft);
            }}
          />
        </div>
        <button className="btn" disabled={!draft.trim()} onClick={() => save(draft)}>
          Save key
        </button>
        <button className="btn" onClick={() => picker.current?.click()}>
          Choose file…
        </button>
        <input
          ref={picker}
          type="file"
          hidden
          accept=".txt,.env,.key,text/plain"
          aria-label={`Key file for ${provider.name || "this provider"}`}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) save(await f.text());
          }}
        />
        {saved && (
          <button className="btn btn-danger" onClick={() => forgetKey(provider.id)}>
            Forget key
          </button>
        )}
      </div>
      <p className={`text-xs ${saved ? "text-good" : "text-muted"}`}>
        {saved
          ? remember
            ? "A key is saved on this device."
            : "A key is saved for this tab only. It is forgotten when the tab is closed."
          : "No key yet, so this provider is skipped."}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function problemsOf(list: ProviderConfig[]): string[] {
  const out: string[] = [];
  list.forEach((p, i) => {
    const label = p.name.trim() || `Provider ${i + 1}`;
    if (!p.name.trim()) out.push(`${label}: give it a name.`);
    if (!p.model.trim()) out.push(`${label}: enter a model.`);
    if (p.type === "openai" && !/^https?:\/\//.test(p.baseUrl.trim()))
      out.push(`${label}: the base URL must start with https://.`);
  });
  return out;
}

function TestConnection({ providers }: { providers: ProviderConfig[] }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const r = await makeAsk(providers)({
        purpose: "solve",
        messages: [{ role: "user", content: 'Reply with exactly this JSON and nothing else: {"ok":true}' }],
        temperature: 0,
        maxTokens: 1000,
      });
      setResult({
        ok: true,
        text: `Connected through ${r.provider.name} (${r.provider.model}). It answered: ${r.content.trim().slice(0, 80)}`,
      });
    } catch (e) {
      const reasons = e instanceof NoProviderError ? e.reasons : [];
      setResult({
        ok: false,
        text: (e instanceof Error ? e.message : "The test failed.") + (reasons.length ? ` ${reasons.join(" ")}` : ""),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn" disabled={testing} onClick={() => void test()}>
        {testing ? "Testing…" : "Test connection"}
      </button>
      {result && (
        <p className={`text-sm ${result.ok ? "text-good" : "text-danger"}`} role="status">
          {result.text}
        </p>
      )}
    </div>
  );
}

function Providers({ initial }: { initial: ProviderConfig[] }) {
  const [list, setList] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nowMs = useNow(10_000);
  useCooldownVersion();
  const cd = localCooldowns();

  const patch = (id: string, p: Partial<ProviderConfig>) =>
    setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setList((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    const problems = problemsOf(list);
    if (problems.length) return setMsg({ ok: false, text: problems[0] });
    await saveProviders(
      list.map((p) => ({ ...p, name: p.name.trim(), model: p.model.trim(), baseUrl: p.baseUrl.trim() })),
    );
    clearCooldowns();
    setMsg({ ok: true, text: "Saved." });
  }

  return (
    <Card title="Providers and models">
      <p className="text-sm text-muted">
        Providers are tried in this order. If one is rate limited or failing, the next is used and the first is left
        alone for a while. Model names change often, so check the provider&apos;s current list if a test says the model
        is not found.
      </p>

      <div className="space-y-3">
        {list.map((p, i) => {
          const until = cd.get(p.id);
          return (
            <div key={p.id} className="space-y-3 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Enable ${p.name}`}
                    checked={p.enabled}
                    onChange={(e) => patch(p.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <input
                  className="input w-44"
                  aria-label="Provider name"
                  value={p.name}
                  onChange={(e) => patch(p.id, { name: e.target.value })}
                />
                <select
                  className="input w-56"
                  aria-label="Provider type"
                  value={p.type}
                  onChange={(e) =>
                    patch(p.id, {
                      type: e.target.value as ProviderConfig["type"],
                      computationOnly: e.target.value === "webllm" ? true : p.computationOnly,
                    })
                  }
                >
                  <option value="openai">OpenAI-compatible (your key)</option>
                  <option value="webllm">In-browser model (no key)</option>
                </select>
                <span className="ml-auto flex gap-1">
                  <button
                    className="btn py-1"
                    aria-label={`Move ${p.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn py-1"
                    aria-label={`Move ${p.name} down`}
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="btn btn-danger py-1"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => {
                      forgetKey(p.id);
                      setList((l) => l.filter((x) => x.id !== p.id));
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.type === "openai" && (
                  <div className="min-w-64 flex-1">
                    <label className="mb-1 block text-xs font-medium">Base URL</label>
                    <input
                      className="input"
                      aria-label="Base URL"
                      value={p.baseUrl}
                      onChange={(e) => patch(p.id, { baseUrl: e.target.value })}
                    />
                  </div>
                )}
                <div className="min-w-64 flex-1">
                  <label className="mb-1 block text-xs font-medium">Model</label>
                  <input
                    className="input font-mono"
                    aria-label="Model"
                    value={p.model}
                    onChange={(e) => patch(p.id, { model: e.target.value })}
                  />
                </div>
              </div>
              {p.type === "openai" && <KeyField provider={p} />}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={p.computationOnly}
                    onChange={(e) => patch(p.id, { computationOnly: e.target.checked })}
                  />
                  Only for computation wordings
                </label>
                {until > nowMs && (
                  <span className="text-danger">
                    Cooling down until {formatDateTime(until)}.{" "}
                    <button className="underline" onClick={() => cd.set(p.id, 0)}>
                      Try it now
                    </button>
                  </span>
                )}
                {p.type === "webllm" && (
                  <span className="text-muted">
                    The first use downloads the model into this browser. It needs a WebGPU browser such as Chrome or
                    Edge.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          onClick={() =>
            setList((l) => [
              ...l,
              {
                id: newId(),
                name: "",
                type: "openai",
                baseUrl: "https://",
                model: "",
                enabled: true,
                computationOnly: false,
              },
            ])
          }
        >
          Add provider
        </button>
        <button className="btn btn-primary" onClick={() => void save()}>
          Save providers
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}
    </Card>
  );
}

function Generator({ providers }: { providers: ProviderConfig[] }) {
  const questions = useQuestions();
  const variants = useVariants();
  const attempts = useAttempts();
  const keyIds = useKeyIds();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const control = useRef<RunControl>({ aborted: false });

  if (!questions || !variants || !attempts) return null;
  const count = (s: string) => variants.filter((v) => v.status === s).length;
  const need = planTopUp(questions, variants, servedVariantIds(attempts)).length;
  const canRun = providers.some((p) => p.enabled && (p.type === "webllm" || keyIds.includes(p.id)));

  async function run() {
    control.current = { aborted: false };
    setEvents([]);
    setRunning(true);
    setWebLLMProgress((t) => setProgress(t));
    try {
      await runGeneration({ providers, control: control.current, onEvent: (e) => setEvents((prev) => [...prev, e]) });
    } catch (e) {
      setEvents((prev) => [...prev, { kind: "stop", text: e instanceof Error ? e.message : "The run failed." }]);
    } finally {
      setWebLLMProgress(null);
      setProgress("");
      setRunning(false);
    }
  }

  const tone: Record<RunEvent["kind"], string> = {
    info: "text-muted",
    ok: "text-good",
    warn: "text-ink",
    stop: "text-danger",
  };

  return (
    <Card title="Generate variants">
      <p className="text-sm text-muted">
        Variants are reworded versions of your questions, made ahead of time and checked by a second, blind answer
        before they are used. A quiz never waits on the AI. If no variant is ready, it shows the original question.
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <li>
          <strong>{count("approved")}</strong> approved
        </li>
        <li>
          <strong>{count("pending")}</strong> waiting to be checked
        </li>
        <li>
          <strong>{count("discarded")}</strong> discarded
        </li>
        <li>
          <strong>{need}</strong> question{need === 1 ? " has" : "s have"} fewer than {TARGET_UNSEEN} fresh variants
        </li>
      </ul>
      {!canRun && (
        <p className="rounded-md bg-paper p-3 text-sm text-muted">
          No API key has been added, so nothing is generated and every quiz uses your original questions. Add a key
          above whenever you want to turn this on.
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={running || !canRun} onClick={() => void run()}>
          {running ? "Working…" : "Generate now"}
        </button>
        {running && (
          <button className="btn" onClick={() => (control.current.aborted = true)}>
            Stop after this question
          </button>
        )}
      </div>
      {progress && <p className="text-sm text-muted">In-browser model: {progress}</p>}
      {events.length > 0 && (
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md bg-paper p-3 text-sm" aria-label="Progress">
          {events.map((e, i) => (
            <li key={i} className={tone[e.kind]}>
              {e.text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SimpleAi({ providers }: { providers: ProviderConfig[] }) {
  const remember = useRemember();
  const primary = providers.find((p) => p.type === "openai" && p.enabled) ?? providers.find((p) => p.type === "openai");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Optional. An AI model can reword your questions so you cannot pass by recognising a sentence. It never changes
        numbers or answers without a check, and nothing it writes is used until it passes one. Without a key, everything
        works exactly as written.
      </p>

      <div className="rounded-md bg-paper p-4 text-sm">
        <p className="font-medium">Get a free key from Groq</p>
        <p className="mt-1 text-muted">
          Groq (not the same as X&apos;s Grok) is a company that runs open AI models quickly and offers a free tier.
          Check their site for current limits.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Open console.groq.com and sign in.</li>
          <li>Choose API Keys, then create a key and copy it.</li>
          <li>Paste it below, or choose a file that contains it, then choose Save key.</li>
        </ol>
      </div>

      {primary ? (
        <KeyField provider={primary} />
      ) : (
        <p className="text-sm text-danger">No provider is set up. Add one under Advanced.</p>
      )}
      <TestConnection providers={providers} />

      <div className="rounded-md border border-line p-3 text-sm text-muted">
        <p>
          <strong className="text-ink">Your key stays in this browser.</strong> It goes straight from here to the
          provider. If a provider refuses requests from a browser, the app&apos;s server passes that one request along
          without storing or logging it. The key is never in the code, in Vercel, or in a backup or pack.
        </p>
        <label className="mt-2 flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            Remember my keys on this device. Off by default, so keys are forgotten when you close the tab. Turn it on
            only on a computer that only you use.
          </span>
        </label>
        <button className="mt-2 text-xs underline" onClick={() => forgetAllKeys()}>
          Forget every key now
        </button>
      </div>
    </div>
  );
}

/** The AI part of Settings: a simple card, with providers and models tucked under Advanced. */
export default function AiSettings() {
  const providers = useProviders();
  if (!providers) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <Card title="Key and connection">
        <SimpleAi providers={providers} />
      </Card>
      <Generator providers={providers} />
      <details className="rounded-md border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Advanced: providers and models</summary>
        <div className="mt-3">
          <Providers initial={providers} />
        </div>
      </details>
    </div>
  );
}
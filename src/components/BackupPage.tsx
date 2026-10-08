"use client";

import { useState } from "react";
import Link from "next/link";
import {
  applyBackup,
  applyPack,
  buildFullBackup,
  buildPack,
  downloadBytes,
  planPack,
  previewContainer,
  today,
  type Preview,
} from "@/lib/backup";
import { BackupError, decodeFile, peekFile, type FileKind } from "@/lib/backupFormat";
import type { Blueprint, Concept, Question, TreeNode, Variant } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { useBlueprints, useConcepts, useNodes, useQuestions, useVariants } from "@/lib/hooks";
import { markBackup } from "@/lib/lastBackup";
import type { MergeCounts, PackOptions } from "@/lib/merge";
import { selectPackContent } from "@/lib/share";
import { pathOf } from "@/lib/tree";
import BackupStatus from "./BackupStatus";
import PasswordInput from "./PasswordInput";

const MIN_PASSWORD = 8;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-line bg-surface p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function message(e: unknown): string {
  return e instanceof BackupError || e instanceof Error ? e.message : "Something went wrong.";
}

function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  optional,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Password{optional ? " (optional)" : ""}</label>
        <PasswordInput label="Password" value={password} onChange={onPassword} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Confirm password</label>
        <PasswordInput label="Confirm password" value={confirm} onChange={onConfirm} />
      </div>
    </div>
  );
}

function checkPassword(pw: string, confirm: string, optional: boolean): string | null {
  if (optional && pw === "" && confirm === "") return null;
  if (pw.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  if (pw !== confirm) return "The two passwords do not match.";
  return null;
}

// ---------------------------------------------------------------------------------------------

function FullBackup() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setDone(null);
    const problem = checkPassword(pw, pw2, false);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const { bytes, counts } = await buildFullBackup(pw);
      downloadBytes(bytes, `ece-review-backup-${today()}.ecebak`);
      markBackup();
      setDone(
        `Saved a backup with ${counts.questions} questions, ${counts.attempts} quiz attempts, and ${counts.images} images.`,
      );
      setPw("");
      setPw2("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Full backup">
      <p className="text-sm text-muted">
        Everything in this browser: your bank, images, and quiz history, which mastery is worked out from. The file is
        encrypted with your password. There is no way to recover a lost password, so keep it somewhere safe.
      </p>
      <BackupStatus />
      <PasswordFields password={pw} confirm={pw2} onPassword={setPw} onConfirm={setPw2} />
      {error && <p className="text-sm text-danger">{error}</p>}
      {done && <p className="text-sm text-good">{done}</p>}
      <button className="btn btn-primary" disabled={busy} onClick={() => void run()}>
        {busy ? "Encrypting…" : "Export full backup"}
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

function PackExport({
  nodes,
  questions,
  blueprints,
  variants,
  concepts,
  initialScope,
}: {
  nodes: TreeNode[];
  questions: Question[];
  blueprints: Blueprint[];
  variants: Variant[];
  concepts: Concept[];
  initialScope: string;
}) {
  const [withVariants, setWithVariants] = useState(true);
  const [scope, setScope] = useState(nodes.some((n) => n.id === initialScope) ? initialScope : "");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const options = nodes
    .map((n) => ({ id: n.id, label: pathOf(nodes, n.id), kind: n.kind }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const sel = selectPackContent(nodes, questions, blueprints, scope || null, variants, withVariants, concepts);
  const defaultName = scope ? pathOf(nodes, scope) : "Whole bank";

  async function run() {
    setDone(null);
    const problem = checkPassword(pw, pw2, true);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const out = await buildPack(scope || null, name.trim() || defaultName, pw || undefined, withVariants);
      const safe =
        (name.trim() || defaultName)
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "pack";
      downloadBytes(out.bytes, `${safe}-${today()}.ecepack`);
      setDone(
        `Saved a pack with ${out.counts.questions} questions${out.counts.concepts > 0 ? `, ${out.counts.concepts} concepts` : ""}, and ${out.counts.images} images.`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Share a bank pack">
      <p className="text-sm text-muted">
        A pack carries only the learning material, so someone else can import the same questions. It never includes your
        quiz history, mastery, cooldowns, analytics, or settings. Share only material you have the right to share.
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="scope" className="mb-1 block text-sm font-medium">
            What to share
          </label>
          <select id="scope" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Whole bank</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({o.kind})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label htmlFor="packname" className="mb-1 block text-sm font-medium">
            Pack name
          </label>
          <input
            id="packname"
            className="input"
            value={name}
            placeholder={defaultName}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <p className="text-sm">
        This pack would hold <strong>{sel.questions.length}</strong> question{sel.questions.length === 1 ? "" : "s"},{" "}
        {sel.concepts.length > 0 && (
          <>
            <strong>{sel.concepts.length}</strong> concept{sel.concepts.length === 1 ? "" : "s"},{" "}
          </>
        )}
        <strong>{sel.imageIds.length}</strong>
        <strong>{sel.nodes.length}</strong> tree item{sel.nodes.length === 1 ? "" : "s"}
        {sel.variants.length > 0 &&
          `, plus ${sel.variants.length} approved AI variant${sel.variants.length === 1 ? "" : "s"}`}
        {sel.blueprints.length > 0 &&
          `, plus ${sel.blueprints.length} mock blueprint${sel.blueprints.length === 1 ? "" : "s"}`}
        .
      </p>
      {variants.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withVariants} onChange={(e) => setWithVariants(e.target.checked)} />
          Include approved AI variants
        </label>
      )}
      {sel.blueprintsSkipped > 0 && (
        <p className="text-sm text-muted">
          {sel.blueprintsSkipped} blueprint{sel.blueprintsSkipped === 1 ? " is" : "s are"} left out because
          {sel.blueprintsSkipped === 1 ? " it names" : " they name"} items that are not in this pack.
        </p>
      )}
      <PasswordFields password={pw} confirm={pw2} onPassword={setPw} onConfirm={setPw2} optional />
      <p className="text-xs text-muted">
        With a password, the recipient needs it to open the file. Without one, anyone who has the file can read it.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {done && <p className="text-sm text-good">{done}</p>}
      <button
        className="btn btn-primary"
        disabled={busy || (sel.questions.length === 0 && sel.concepts.length === 0)}
        onClick={() => void run()}
      >
        {busy ? "Working…" : "Export pack"}
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

function CountsRow({ label, c }: { label: string; c: MergeCounts }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5">{label}</td>
      <td className="px-2 text-right tabular-nums">{c.added}</td>
      <td className="px-2 text-right tabular-nums">{c.updated}</td>
      <td className="px-2 text-right tabular-nums">{c.unchanged}</td>
      <td className="pl-2 text-right tabular-nums">{c.keptLocal}</td>
    </tr>
  );
}

type ImportState =
  | { step: "idle" }
  | { step: "password"; fileName: string; bytes: Uint8Array; kind: FileKind }
  | { step: "preview"; fileName: string; preview: Preview }
  | { step: "done"; message: string };

function ImportFile() {
  const [state, setState] = useState<ImportState>({ step: "idle" });
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupMode, setBackupMode] = useState<"merge" | "replace">("merge");
  const [packOptions, setPackOptions] = useState<PackOptions>({ mode: "update", matchByName: true });

  async function open(bytes: Uint8Array, fileName: string, password?: string) {
    setBusy(true);
    setError(null);
    try {
      const container = await decodeFile(bytes, password);
      const preview = await previewContainer(container);
      setState({ step: "preview", fileName, preview });
      setPw("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const peek = peekFile(bytes);
      if (peek.encrypted) setState({ step: "password", fileName: file.name, bytes, kind: peek.kind });
      else await open(bytes, file.name);
    } catch (e) {
      setError(message(e));
    }
  }

  async function run() {
    if (state.step !== "preview") return;
    const p = state.preview;
    setBusy(true);
    setError(null);
    try {
      if (p.kind === "backup") {
        if (
          backupMode === "replace" &&
          !window.confirm("Replace everything in this browser with the contents of this file? This cannot be undone.")
        ) {
          setBusy(false);
          return;
        }
        await applyBackup(p, backupMode);
        const c = p.plan.counts;
        setState({
          step: "done",
          message:
            backupMode === "replace"
              ? "Replaced this browser's data with the backup."
              : `Merged the backup: ${c.questions.added} new and ${c.questions.updated} updated questions, ${c.attempts.added} new quiz attempts.`,
        });
      } else {
        const plan = planPack(p, packOptions);
        await applyPack(p, plan);
        const q = plan.counts.questions;
        setState({
          step: "done",
          message: `Imported the pack: ${q.added} new and ${q.updated} updated questions. Your quiz history and mastery were not touched.`,
        });
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Import a file">
      <p className="text-sm text-muted">
        Choose a full backup (<code>.ecebak</code>) or a bank pack (<code>.ecepack</code>). You will see what it would
        change before anything is saved.
      </p>

      {state.step === "idle" && (
        <input
          type="file"
          aria-label="Backup or pack file"
          accept=".ecebak,.ecepack"
          className="block text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void onFile(f);
          }}
        />
      )}

      {state.step === "password" && (
        <div className="space-y-2">
          <p className="text-sm">
            <strong>{state.fileName}</strong> is a {state.kind === "backup" ? "full backup" : "bank pack"} protected by
            a password.
          </p>
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Password</label>
              <PasswordInput
                label="Password"
                className="w-64"
                autoComplete="off"
                value={pw}
                onChange={setPw}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pw) void open(state.bytes, state.fileName, pw);
                }}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || !pw}
              onClick={() => void open(state.bytes, state.fileName, pw)}
            >
              {busy ? "Decrypting…" : "Open file"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setState({ step: "idle" });
                setError(null);
                setPw("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.step === "preview" && state.preview.kind === "backup" && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{state.fileName}</strong>: a full backup made on {formatDate(state.preview.manifest.createdAt)}.
          </p>
          <div className="overflow-x-auto rounded-md border border-line p-3">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 text-left font-medium" />
                  <th className="px-2 pb-2 text-right font-medium">New</th>
                  <th className="px-2 pb-2 text-right font-medium">Updated</th>
                  <th className="px-2 pb-2 text-right font-medium">Same</th>
                  <th className="pb-2 pl-2 text-right font-medium">Newer here</th>
                </tr>
              </thead>
              <tbody>
                <CountsRow label="Tree items" c={state.preview.plan.counts.nodes} />
                <CountsRow label="Questions" c={state.preview.plan.counts.questions} />
                <CountsRow label="Quiz attempts" c={state.preview.plan.counts.attempts} />
                <CountsRow label="Blueprints" c={state.preview.plan.counts.blueprints} />
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">
            {state.preview.newImages.length} new image{state.preview.newImages.length === 1 ? "" : "s"}. In a merge, the
            newer edit of each item wins, quiz attempts are combined, and mastery follows from the combined attempts.
          </p>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium">How to import</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bmode"
                checked={backupMode === "merge"}
                onChange={() => setBackupMode("merge")}
              />
              Merge into what is here (recommended)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bmode"
                checked={backupMode === "replace"}
                onChange={() => setBackupMode("replace")}
              />
              Replace everything here with this file
            </label>
          </fieldset>
        </div>
      )}

      {state.step === "preview" &&
        state.preview.kind === "pack" &&
        (() => {
          const p = state.preview;
          const plan = planPack(p, packOptions);
          const c = plan.counts;
          return (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{p.manifest.name || state.fileName}</strong>: a bank pack made on{" "}
                {formatDate(p.manifest.createdAt)}.
              </p>
              <div className="overflow-x-auto rounded-md border border-line p-3">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="pb-2 text-left font-medium" />
                      <th className="px-2 pb-2 text-right font-medium">New</th>
                      <th className="px-2 pb-2 text-right font-medium">Already here</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["category", "subject", "topic"] as const).map((k) => (
                      <tr key={k} className="border-t border-line">
                        <td className="py-1.5">
                          {k === "category" ? "Categories" : k === "subject" ? "Subjects" : "Topics"}
                        </td>
                        <td className="px-2 text-right tabular-nums">{c[k].added}</td>
                        <td className="px-2 text-right tabular-nums">{c[k].existing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="mt-3 w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="pb-2 text-left font-medium" />
                      <th className="px-2 pb-2 text-right font-medium">New</th>
                      <th className="px-2 pb-2 text-right font-medium">Updated</th>
                      <th className="px-2 pb-2 text-right font-medium">Same</th>
                      <th className="pb-2 pl-2 text-right font-medium">Kept yours</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CountsRow label="Questions" c={c.questions} />
                  </tbody>
                </table>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>
                  {p.newImages.length} new image{p.newImages.length === 1 ? "" : "s"}.
                </li>
                {c.questions.updated > 0 && (
                  <li>{c.questions.updated} of your questions will be replaced by the pack&apos;s newer version.</li>
                )}
                {c.questions.keptLocal > 0 && <li>{c.questions.keptLocal} stay as they are here.</li>}
                {(p.incoming.concepts?.length ?? 0) > 0 && (
                  <li>
                    Concepts: {c.concepts.added} new, {c.concepts.updated} updated.
                  </li>
                )}
                {(p.incoming.variants?.length ?? 0) > 0 && (
                  <li>
                    AI variants: {c.variants.added} new, {c.variants.updated} updated. Variants are skipped for a
                    question that you have edited, since they were written for the pack&apos;s version.
                  </li>
                )}
                {p.incoming.blueprints.length > 0 && (
                  <li>
                    Mock blueprints: {c.blueprints.added} new, {c.blueprints.updated} updated, {c.blueprints.kept} kept
                    yours, {c.blueprints.skipped} skipped.
                  </li>
                )}
                <li>Your quiz history, mastery, and cooldowns are never changed by a pack.</li>
              </ul>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={packOptions.matchByName}
                  onChange={(e) => setPackOptions((o) => ({ ...o, matchByName: e.target.checked }))}
                />
                Put items into my existing categories, subjects, and topics that have the same name
              </label>
              <fieldset className="space-y-1 text-sm">
                <legend className="mb-1 font-medium">How to import</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pmode"
                    checked={packOptions.mode === "update"}
                    onChange={() => setPackOptions((o) => ({ ...o, mode: "update" }))}
                  />
                  Add new and update (a newer version in the pack replaces mine)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pmode"
                    checked={packOptions.mode === "add_only"}
                    onChange={() => setPackOptions((o) => ({ ...o, mode: "add_only" }))}
                  />
                  Add new only (never touch a question I already have)
                </label>
              </fieldset>
            </div>
          );
        })()}

      {error && <p className="text-sm text-danger">{error}</p>}

      {state.step === "preview" && (
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Importing…" : "Import"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setState({ step: "idle" });
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {state.step === "done" && (
        <div className="space-y-2">
          <p className="text-sm text-good">{state.message}</p>
          <div className="flex gap-2">
            <Link href="/bank" className="btn">
              Open the question bank
            </Link>
            <Link href="/progress" className="btn">
              Open mastery
            </Link>
            <button className="btn" onClick={() => setState({ step: "idle" })}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export default function BackupPage({ initialScope, embedded = false }: { initialScope: string; embedded?: boolean }) {
  const nodes = useNodes();
  const questions = useQuestions();
  const blueprints = useBlueprints();
  const variants = useVariants();
  const concepts = useConcepts();

  return (
    <div className={embedded ? "space-y-6" : "max-w-3xl space-y-6"}>
      <div>
        {embedded ? (
          <h2 className="text-lg font-semibold">Backup and sharing</h2>
        ) : (
          <h1 className="text-xl font-semibold">Backup and sharing</h1>
        )}
        <p className="mt-1 text-sm text-muted">
          Your data lives in this browser only. Export a full backup regularly, and use a bank pack to give someone else
          your questions.
        </p>
      </div>
      <FullBackup />
      {nodes && questions && blueprints && variants && concepts ? (
        <PackExport
          nodes={nodes}
          questions={questions}
          blueprints={blueprints}
          variants={variants}
          concepts={concepts}
          initialScope={initialScope}
        />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
      <ImportFile />
    </div>
  );
}
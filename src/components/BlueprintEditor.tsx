"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { allocate, blueprintProblems } from "@/lib/blueprint";
import { countAvailable } from "@/lib/compose";
import type { Blueprint, Question, TreeNode } from "@/lib/db";
import { deleteBlueprint, saveBlueprint } from "@/lib/blueprints";
import { newId } from "@/lib/ids";
import { childrenOf, pathOf } from "@/lib/tree";

interface Row {
  id: string;
  nodeId: string;
  percent: string;
}

interface Props {
  category: TreeNode;
  nodes: TreeNode[];
  questions: Question[];
  initial: Blueprint | null;
}

export default function BlueprintEditor({ category, nodes, questions, initial }: Props) {
  const router = useRouter();
  const [total, setTotal] = useState(initial ? String(initial.totalItems) : "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial ? initial.entries.map((e) => ({ id: e.id, nodeId: e.nodeId, percent: String(e.percent) })) : [],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const options = nodes
    .filter((n) => n.kind === "subject" || n.kind === "topic")
    .map((n) => ({ id: n.id, label: pathOf(nodes, n.id), kind: n.kind }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalNum = Number(total);
  const percents = rows.map((r) => Number(r.percent));
  const sum = percents.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);
  const sumOk = rows.length > 0 && Math.abs(sum - 100) <= 0.01;
  const wanted = allocate(
    Number.isInteger(totalNum) && totalNum > 0 ? totalNum : 0,
    percents.map((p) => (Number.isFinite(p) ? p : 0)),
  );

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function spreadEvenly() {
    const subjects = childrenOf(nodes, category.id);
    if (subjects.length === 0) return;
    const share = Math.floor(10000 / subjects.length) / 100;
    setRows(
      subjects.map((s, i) => ({
        id: newId(),
        nodeId: s.id,
        percent: String(
          i === subjects.length - 1 ? Math.round((100 - share * (subjects.length - 1)) * 100) / 100 : share,
        ),
      })),
    );
  }

  async function save() {
    const entries = rows.map((r) => ({ id: r.id, nodeId: r.nodeId, percent: Number(r.percent) }));
    const problems = blueprintProblems({ totalItems: totalNum, entries });
    setErrors(problems);
    if (problems.length) return;
    setSaving(true);
    try {
      await saveBlueprint(category.id, totalNum, entries);
      router.push("/quiz");
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Could not save."]);
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this blueprint? The category's mock board stays unavailable until you make a new one."))
      return;
    await deleteBlueprint(category.id);
    router.push("/quiz");
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-muted">Mock blueprint</p>
        <h1 className="text-xl font-semibold">{category.name}</h1>
        <p className="mt-1 text-sm text-muted">
          A mock for this category draws each entry&apos;s share from its subject or topic. An entry can come from any
          category, which is how a topic is shared between mocks. The app assumes no figures: enter the item count and
          weights from your own source.
        </p>
      </div>

      <div>
        <label htmlFor="total" className="mb-1 block text-sm font-medium">
          Total items in the mock
        </label>
        <input
          id="total"
          className="input w-32"
          inputMode="numeric"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="font-medium">Entries</h2>
          <button
            className="btn py-1"
            onClick={() => setRows((rs) => [...rs, { id: newId(), nodeId: "", percent: "" }])}
          >
            Add entry
          </button>
          <button className="btn py-1" onClick={spreadEvenly} disabled={childrenOf(nodes, category.id).length === 0}>
            Spread evenly across this category&apos;s subjects
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface p-3">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 text-left font-medium">Subject or topic</th>
                  <th className="pb-2 pl-2 text-left font-medium">Percent</th>
                  <th className="pb-2 pl-2 text-right font-medium">Items</th>
                  <th className="pb-2 pl-2 text-right font-medium">Available</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const avail = r.nodeId ? countAvailable(nodes, questions, r.nodeId) : 0;
                  const short = r.nodeId !== "" && avail < wanted[i];
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-2">
                        <select
                          className="input"
                          aria-label="Subject or topic"
                          value={r.nodeId}
                          onChange={(e) => update(r.id, { nodeId: e.target.value })}
                        >
                          <option value="">Choose…</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label} ({o.kind})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pl-2">
                        <input
                          className="input w-24"
                          inputMode="decimal"
                          aria-label="Percent"
                          value={r.percent}
                          onChange={(e) => update(r.id, { percent: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">{wanted[i]}</td>
                      <td className={`py-2 pl-2 text-right tabular-nums ${short ? "text-danger" : ""}`}>
                        {r.nodeId ? avail : "–"}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button className="btn py-1" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={`mt-2 text-sm ${rows.length === 0 ? "text-muted" : sumOk ? "text-good" : "text-danger"}`}>
          Percentages add up to {Math.round(sum * 100) / 100}%{sumOk ? "." : ". They must add up to 100%."}
        </p>
        <p className="text-xs text-muted">
          Items are rounded so they add up to the total exactly. If an entry has fewer questions than it asks for, the
          mock can still run but cannot award mastery.
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="list-disc rounded-md border border-danger/40 bg-danger/5 py-2 pr-3 pl-7 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          Save blueprint
        </button>
        <Link href="/quiz" className="btn">
          Cancel
        </Link>
        {initial && (
          <button className="btn btn-danger ml-auto" onClick={() => void remove()}>
            Delete blueprint
          </button>
        )}
      </div>
    </div>
  );
}
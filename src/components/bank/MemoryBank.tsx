"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CardKind, MemoryCard, TreeNode } from "@/lib/db";
import { CARD_KINDS, KIND_LABEL, cardSubject } from "@/lib/memory/cards";
import { categoriesOf } from "@/lib/bank/tree";
import { usePagination } from "@/lib/ui/usePagination";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import Pagination from "@/components/ui/Pagination";
import RichText from "@/components/ui/RichText";
import TreePanel from "./TreePanel";

interface Props {
  nodes: TreeNode[];
  cards: MemoryCard[];
  /** The node picked in the tree. A topic picked on another tab counts as its subject here. */
  selected: TreeNode | null;
  onSelect: (id: string | null) => void;
}

/**
 * Bank › Memory: the memory cards, by category and subject. The tree is the one questions use, stopped at subjects,
 * since a topic may have nothing to memorise or a great deal. Cards are written in the editor.
 */
export default function MemoryBank({ nodes, cards, selected, onSelect }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<CardKind | "">("");
  const [search, setSearch] = useState("");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = selected?.kind === "topic" && selected.parentId ? (byId.get(selected.parentId) ?? null) : selected;

  // A card counts toward its deck and its subject.
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => id && counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const c of cards) {
    bump(c.categoryId);
    bump(cardSubject(c, byId));
  }

  const inNode = !node
    ? cards
    : node.kind === "category"
      ? cards.filter((c) => c.categoryId === node.id)
      : cards.filter((c) => cardSubject(c, byId) === node.id);
  const q = search.trim().toLowerCase();
  const shown = inNode
    .filter((c) => !kind || c.kind === kind)
    .filter((c) => !q || `${c.prompt} ${c.answer} ${(c.tags ?? []).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
  const { page, pages, setPage, reset, pageItems, pageSize } = usePagination(shown);
  const name = (id: string | undefined) => (id ? (byId.get(id)?.name ?? "") : "");

  // A new card starts where you are: the deck picked, or the subject picked and its first deck.
  const deck = node?.kind === "category" ? node.id : node?.kind === "subject" ? categoriesOf(node)[0] : undefined;
  const addHref =
    "/editor?mode=card" + (deck ? `&deck=${deck}` : "") + (node?.kind === "subject" ? `&subject=${node.id}` : "");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="scroll-thin sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <TreePanel
          nodes={nodes}
          counts={counts}
          selectedId={node?.id ?? null}
          onSelect={(id) => {
            onSelect(id);
            reset();
          }}
          subjectsOnly
          allLabel="All cards"
        />
      </div>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input min-w-48 flex-1"
            aria-label="Search cards"
            placeholder={node ? `Search ${node.name} cards and tags` : "Search cards and tags"}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              reset();
            }}
          />
          <select
            className="input w-auto"
            aria-label="Kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as CardKind | "");
              reset();
            }}
          >
            <option value="">All kinds</option>
            {CARD_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.plural}
              </option>
            ))}
          </select>
          <Link href={addHref} className="btn btn-primary">
            Add card
          </Link>
        </div>

        {shown.length === 0 ? (
          <p className="card p-6 text-sm text-muted">
            {cards.length === 0
              ? "No memory cards yet. Add the constants, conversions, formulas, principles, definitions, units and ranges you need to know by heart."
              : inNode.length === 0
                ? `No cards in ${node?.name ?? "this place"} yet.`
                : "No cards match."}
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Prompt</th>
                  <th className="px-4 py-2.5 font-medium">Answer</th>
                  <th className="px-4 py-2.5 font-medium">Kind</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => {
                  const key = categoryKey(name(c.categoryId));
                  const subject = name(cardSubject(c, byId));
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t border-line align-top hover:bg-paper"
                      onClick={() => router.push(`/editor?card=${c.id}`)}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/editor?card=${c.id}`}
                          className="flex items-start gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {key && (
                            <span
                              aria-label={name(c.categoryId)}
                              className={`mt-1.5 size-2 shrink-0 rounded-sm ${CATEGORY_STYLE[key].bar}`}
                            />
                          )}
                          <RichText text={c.prompt} />
                        </Link>
                        {(subject || (c.tags?.length ?? 0) > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1 pl-4">
                            {subject && node?.kind !== "subject" && (
                              <span className="text-xs text-muted">{subject}</span>
                            )}
                            {(c.tags ?? []).map((t) => (
                              <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <RichText text={c.answer} />
                      </td>
                      <td className="px-4 py-2.5 text-muted">{KIND_LABEL[c.kind]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} total={shown.length} pageSize={pageSize} onChange={setPage} />
      </section>
    </div>
  );
}

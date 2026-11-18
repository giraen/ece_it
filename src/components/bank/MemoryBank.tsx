"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CardKind, MemoryCard, TreeNode } from "@/lib/db";
import {
  CARD_KINDS,
  KIND_LABEL,
  addCardTags,
  cardDecks,
  cardPlaces,
  cardSubject,
  deleteCards,
  inDeck,
  inSubject,
  moveCards,
  removeCardTag,
  restoreCards,
  snapshotCards,
  useCardTagSuggestions,
} from "@/lib/memory/cards";
import { categoriesOf } from "@/lib/bank/tree";
import { usePagination } from "@/lib/ui/usePagination";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import Pagination from "@/components/ui/Pagination";
import RichText from "@/components/ui/RichText";
import TreePanel from "./TreePanel";
import CardBar, { useUndoToast } from "@/components/memory/CardBar";

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
  const [picked, setPicked] = useState<string[]>([]);
  const { toast, say, dismiss } = useUndoToast();
  const tagHelp = useCardTagSuggestions();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = selected?.kind === "topic" && selected.parentId ? (byId.get(selected.parentId) ?? null) : selected;

  // A card counts toward every deck and subject it is in, once each.
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const c of cards) {
    cardDecks(c).forEach(bump);
    new Set(cardPlaces(c, byId).map((p) => p.subjectId)).forEach(bump);
  }

  const inNode = !node
    ? cards
    : node.kind === "category"
      ? cards.filter((c) => inDeck(c, node.id))
      : cards.filter((c) => inSubject(c, node.id, byId));
  const q = search.trim().toLowerCase();
  const shown = inNode
    .filter((c) => !kind || c.kind === kind)
    .filter((c) => !q || `${c.prompt} ${c.answer} ${(c.tags ?? []).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
  const { page, pages, setPage, reset, pageItems, pageSize } = usePagination(shown);
  // Only selected cards still in view count, as in the question list.
  const chosen = picked.filter((id) => shown.some((c) => c.id === id));
  const pageAll = pageItems.length > 0 && pageItems.every((c) => chosen.includes(c.id));
  /** Runs a change to many cards and hands back its undo. */
  async function change(ids: string[], run: () => Promise<void>) {
    const before = await snapshotCards(ids);
    await run();
    return () => restoreCards(before);
  }
  const name = (id: string | undefined) => (id ? (byId.get(id)?.name ?? "") : "");
  const placeName = (p: { categoryId: string; subjectId?: string }) =>
    p.subjectId ? `${name(p.categoryId)} › ${name(p.subjectId)}` : name(p.categoryId);

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
                  <th className="w-10 py-2.5 pl-4">
                    <input
                      type="checkbox"
                      aria-label="Select every card on this page"
                      checked={pageAll}
                      onChange={(e) =>
                        setPicked((cur) =>
                          e.target.checked
                            ? [...new Set([...cur, ...pageItems.map((c) => c.id)])]
                            : cur.filter((id) => !pageItems.some((c) => c.id === id)),
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Prompt</th>
                  <th className="px-4 py-2.5 font-medium">Answer</th>
                  <th className="px-4 py-2.5 font-medium">Kind</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => {
                  const key = categoryKey(name(c.categoryId));
                  const subject = name(cardSubject(c, byId));
                  const places = cardPlaces(c, byId);
                  const shared = places.length > 1;
                  return (
                    <tr
                      key={c.id}
                      className={`cursor-pointer border-t border-line align-top hover:bg-paper ${
                        chosen.includes(c.id) ? "bg-accent-soft/50" : ""
                      }`}
                      onClick={() => router.push(`/editor?card=${c.id}`)}
                    >
                      <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select card: ${c.prompt.slice(0, 60)}`}
                          checked={chosen.includes(c.id)}
                          onChange={(e) =>
                            setPicked((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))
                          }
                        />
                      </td>
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
                        {(subject || shared || (c.tags?.length ?? 0) > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1 pl-4">
                            {shared ? (
                              <span
                                className="text-xs text-muted"
                                title="One card, shared: reviewed once, counted in each"
                              >
                                Shared: {places.map(placeName).join(" · ")}
                              </span>
                            ) : (
                              subject &&
                              node?.kind !== "subject" && <span className="text-xs text-muted">{subject}</span>
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
        <CardBar
          chosen={cards.filter((c) => chosen.includes(c.id)).map((c) => ({ id: c.id, tags: c.tags ?? [] }))}
          suggestions={tagHelp}
          visibleCount={shown.length}
          onSelectAll={() => setPicked(shown.map((c) => c.id))}
          onClear={() => setPicked([])}
          onAddTags={(ids, tags) => change(ids, () => addCardTags(ids, tags))}
          onRemoveTag={(ids, tag) => change(ids, () => removeCardTag(ids, tag))}
          move={{ nodes, run: (ids, place) => change(ids, () => moveCards(ids, place)) }}
          remove={{ label: "Delete", ask: true, run: (ids) => change(ids, () => deleteCards(ids)) }}
          toast={toast}
          say={say}
          dismiss={dismiss}
        />
      </section>
    </div>
  );
}

import { describe, expect, it } from "vitest";
import type { Question, TreeNode } from "../db";
import { composeQuiz, countAvailable, shuffle } from "../compose";

/** Small deterministic random source so tests do not flake. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const node = (id: string, kind: TreeNode["kind"], parentId: string | null): TreeNode => ({
  id,
  kind,
  parentId,
  name: id,
  order: 0,
  createdAt: 0,
  updatedAt: 0,
});

const nodes: TreeNode[] = [
  node("cat", "category", null),
  node("subA", "subject", "cat"),
  node("subB", "subject", "cat"),
  node("topA1", "topic", "subA"),
  node("topA2", "topic", "subA"),
  node("topB1", "topic", "subB"),
];

let n = 0;
const q = (topicId: string, tags: string[] = []): Question => ({
  id: `q${n++}`,
  topicId,
  type: "standard",
  stem: "s",
  choices: [
    { id: "a", text: "a" },
    { id: "b", text: "b" },
  ],
  correctChoiceId: "a",
  tags,
  createdAt: 0,
  updatedAt: 0,
});

const many = (count: number, topicId: string, tags: string[] = []) =>
  Array.from({ length: count }, () => q(topicId, tags));

describe("shuffle", () => {
  it("keeps every element and does not touch the input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seeded(1));
    expect(out.slice().sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("composeQuiz", () => {
  it("spreads a topic quiz evenly across tags", () => {
    const qs = [...many(10, "topA1", ["x"]), ...many(10, "topA1", ["y"])];
    const picked = composeQuiz({ nodes, questions: qs, scope: nodes[3], length: 6, rand: seeded(7) });
    expect(picked).toHaveLength(6);
    expect(picked.filter((p) => p.tags[0] === "x")).toHaveLength(3);
    expect(picked.filter((p) => p.tags[0] === "y")).toHaveLength(3);
  });

  it("fills from the bigger group when a small one runs out", () => {
    const qs = [...many(10, "topA1", ["x"]), ...many(2, "topA1", ["y"])];
    const picked = composeQuiz({ nodes, questions: qs, scope: nodes[3], length: 8, rand: seeded(3) });
    expect(picked.filter((p) => p.tags[0] === "y")).toHaveLength(2);
    expect(picked.filter((p) => p.tags[0] === "x")).toHaveLength(6);
  });

  it("returns the whole pool when it is smaller than the requested length", () => {
    const qs = many(4, "topA1");
    expect(composeQuiz({ nodes, questions: qs, scope: nodes[3], length: 15 })).toHaveLength(4);
  });

  it("spreads a subject quiz across its topics", () => {
    const qs = [...many(10, "topA1"), ...many(10, "topA2")];
    const picked = composeQuiz({ nodes, questions: qs, scope: nodes[1], length: 10, rand: seeded(5) });
    expect(picked.filter((p) => p.topicId === "topA1")).toHaveLength(5);
    expect(picked.filter((p) => p.topicId === "topA2")).toHaveLength(5);
  });

  it("spreads a category quiz across subjects, then topics", () => {
    const qs = [...many(20, "topA1"), ...many(20, "topA2"), ...many(40, "topB1")];
    const picked = composeQuiz({ nodes, questions: qs, scope: nodes[0], length: 20, rand: seeded(9) });
    const bySubject = (t: string[]) => picked.filter((p) => t.includes(p.topicId)).length;
    expect(bySubject(["topA1", "topA2"])).toBe(10);
    expect(bySubject(["topB1"])).toBe(10);
    expect(picked.filter((p) => p.topicId === "topA1")).toHaveLength(5);
  });

  it("ignores deleted questions and questions outside the scope", () => {
    const gone = { ...q("topA1"), deletedAt: 1 };
    const qs = [gone, ...many(3, "topB1")];
    expect(composeQuiz({ nodes, questions: qs, scope: nodes[3], length: 5 })).toHaveLength(0);
  });

  it("never repeats a question", () => {
    const qs = many(30, "topA1", ["x"]);
    const picked = composeQuiz({ nodes, questions: qs, scope: nodes[3], length: 30, rand: seeded(2) });
    expect(new Set(picked.map((p) => p.id)).size).toBe(30);
  });
});

describe("countAvailable", () => {
  it("counts live questions under a scope", () => {
    const qs = [...many(3, "topA1"), ...many(2, "topB1"), { ...q("topA1"), deletedAt: 5 }];
    expect(countAvailable(nodes, qs, "cat")).toBe(5);
    expect(countAvailable(nodes, qs, "subA")).toBe(3);
  });
});

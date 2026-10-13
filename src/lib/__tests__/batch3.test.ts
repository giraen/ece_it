import { describe, expect, it } from "vitest";
import { joinReference, keepSourceOnly, sourceLabel, splitReference } from "../sources";
import type { Source } from "../sources";
import { awardsMastery, masteryFor } from "../mastery";
import type { QuizAttempt } from "../db";

const src = (over: Partial<Source> = {}): Source => ({
  id: "s1",
  kind: "book",
  title: "Electronics Vol. 2",
  authors: "Gonzalez",
  edition: "3rd ed.",
  year: "2019",
  publisher: "Pearson",
  url: "",
  createdAt: 0,
  ...over,
});

describe("sources", () => {
  it("writes a label", () => {
    expect(sourceLabel(src())).toBe("Gonzalez, Electronics Vol. 2, 3rd ed. (2019), Pearson");
    expect(sourceLabel(src({ authors: "", edition: "", year: "", publisher: "", url: "https://x.org" }))).toBe(
      "Electronics Vol. 2, https://x.org",
    );
  });
  it("joins and splits a reference", () => {
    const s = src();
    const ref = joinReference(sourceLabel(s), "p. 143, Problem 5");
    expect(ref).toBe("Gonzalez, Electronics Vol. 2, 3rd ed. (2019), Pearson, p. 143, Problem 5");
    expect(splitReference(ref, [s])).toEqual({ source: s, where: "p. 143, Problem 5" });
    expect(splitReference(sourceLabel(s), [s])).toEqual({ source: s, where: "" });
    expect(joinReference("A", "  ")).toBe("A");
  });
  it("does not match a different text that only starts the same", () => {
    const s = src({ authors: "", edition: "", year: "", publisher: "", title: "Circuits" });
    expect(splitReference("Circuits and Systems, p. 3", [s]).source).toBeNull();
  });
  it("prefers the longest matching source", () => {
    const a = src({ id: "a", authors: "", edition: "", year: "", publisher: "", title: "Circuits" });
    const b = src({ id: "b", authors: "", edition: "", year: "", publisher: "", title: "Circuits, 2nd ed." });
    expect(splitReference("Circuits, 2nd ed., p. 4", [a, b]).source?.id).toBe("b");
  });
  it("keeps only the source", () => {
    const s = src();
    expect(keepSourceOnly(`${sourceLabel(s)}, p. 9`, [s])).toBe(sourceLabel(s));
    expect(keepSourceOnly("my own note, p. 9", [s])).toBe("my own note, p. 9");
  });
});

const attempt = (over: Partial<QuizAttempt>): QuizAttempt => ({
  id: "a",
  scopeNodeId: "n",
  scopeKind: "topic",
  scopeName: "T",
  mode: "standard",
  status: "submitted",
  startedAt: 1,
  submittedAt: 1000,
  currentIndex: 0,
  items: [],
  summary: { passed: false, masteryAwarded: false } as QuizAttempt["summary"],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("practice quizzes", () => {
  const node = { id: "n", kind: "topic" as const };
  it("a passed practice quiz awards nothing", () => {
    const a = attempt({ practice: true, eligible: false, summary: { passed: true } as QuizAttempt["summary"] });
    expect(awardsMastery(a)).toBe(false);
    expect(masteryFor([a], node, 2000).status).toBe("not_yet");
  });
  it("a failed practice quiz never locks, even if it looks eligible", () => {
    const a = attempt({ practice: true });
    expect(masteryFor([a], node, 2000).lockedUntil).toBeUndefined();
  });
  it("a failed real quiz still locks, and a later practice does not lift or add to it", () => {
    const real = attempt({ id: "r", submittedAt: 1000 });
    const practice = attempt({ id: "p", practice: true, submittedAt: 2000, eligible: false });
    expect(masteryFor([real], node, 3000).lockedUntil).toBeDefined();
    expect(masteryFor([real, practice], node, 3000).lockedUntil).toBe(masteryFor([real], node, 3000).lockedUntil);
  });
  it("does not remove mastery already held", () => {
    const won = attempt({
      id: "w",
      submittedAt: 500,
      summary: { passed: true, masteryAwarded: true } as QuizAttempt["summary"],
    });
    const practice = attempt({ id: "p", practice: true, submittedAt: 2000, eligible: false });
    expect(masteryFor([won, practice], node, 3000).status).toBe("mastered");
  });
});
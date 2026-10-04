import { describe, expect, it } from "vitest";
import {
  evaluatePass,
  explainGroup,
  groupStats,
  itemCredit,
  median,
  needsWork,
  overallStats,
  speedFactor,
  type ScoredItem,
} from "../scoring";

const item = (over: Partial<ScoredItem> = {}): ScoredItem => ({
  answered: true,
  correct: true,
  sureness: "sure",
  activeMs: 30_000,
  targetSec: 60,
  credit: 1,
  ...over,
});

describe("speedFactor", () => {
  it("is 1 up to the target", () => {
    expect(speedFactor(0, 60)).toBe(1);
    expect(speedFactor(60_000, 60)).toBe(1);
  });
  it("falls in a straight line to 0.7 at twice the target", () => {
    expect(speedFactor(90_000, 60)).toBeCloseTo(0.85);
    expect(speedFactor(120_000, 60)).toBeCloseTo(0.7);
  });
  it("stays at 0.7 beyond twice the target", () => {
    expect(speedFactor(600_000, 60)).toBeCloseTo(0.7);
  });
});

describe("itemCredit", () => {
  it("matches the worked example in the spec", () => {
    // Correct, Not sure, 90 s on a 60 s target: 0.6 x 0.85 = 0.51
    const c = itemCredit({ correct: true, sureness: "not_sure", activeMs: 90_000, targetSec: 60 });
    expect(c).toBeCloseTo(0.51);
  });
  it("gives full credit for a fast, sure, correct answer", () => {
    expect(itemCredit({ correct: true, sureness: "sure", activeMs: 10_000, targetSec: 60 })).toBe(1);
  });
  it("gives nothing for wrong answers or lucky guesses", () => {
    expect(itemCredit({ correct: false, sureness: "sure", activeMs: 1, targetSec: 60 })).toBe(0);
    expect(itemCredit({ correct: true, sureness: "just_guessed", activeMs: 1, targetSec: 60 })).toBe(0);
    expect(itemCredit({ correct: true, sureness: undefined, activeMs: 1, targetSec: 60 })).toBe(0);
  });
});

describe("median", () => {
  it("handles empty, odd, and even lists", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("overallStats", () => {
  it("counts unanswered questions as zero credit", () => {
    const o = overallStats([item(), item({ answered: false, correct: false, credit: 0, sureness: undefined })]);
    expect(o.n).toBe(2);
    expect(o.answered).toBe(1);
    expect(o.correct).toBe(1);
    expect(o.credit).toBeCloseTo(0.5);
  });
});

describe("groupStats", () => {
  it("lets one item count toward several groups and tracks confident errors", () => {
    const items = [
      { ...item(), tags: ["a", "b"] },
      { ...item({ correct: false, credit: 0, sureness: "sure" }), tags: ["a"] },
    ];
    const groups = groupStats(items, (i) => i.tags.map((t) => ({ key: t, label: t })));
    const a = groups.find((g) => g.key === "a")!;
    const b = groups.find((g) => g.key === "b")!;
    expect(a.n).toBe(2);
    expect(a.wrong).toBe(1);
    expect(a.confidentErrors).toBe(1);
    expect(b.n).toBe(1);
    expect(b.credit).toBe(1);
  });
});

describe("evaluatePass (95% bar)", () => {
  const fine = groupStats([item(), item()], () => [{ key: "g", label: "G" }]);

  it("passes at or above 95%", () => {
    expect(evaluatePass(0.95, fine).passed).toBe(true);
    expect(evaluatePass(0.99, fine).passed).toBe(true);
  });
  it("fails below 95%", () => {
    expect(evaluatePass(0.949, fine).passed).toBe(false);
    expect(evaluatePass(0.8, fine).passed).toBe(false);
  });
  it("fails when a sizeable group is below the floor", () => {
    const groups = groupStats(
      [item(), item(), item({ correct: false, credit: 0 }), item({ correct: false, credit: 0 })],
      (i) => [{ key: i.correct ? "ok" : "bad", label: i.correct ? "OK" : "Bad" }],
    );
    const r = evaluatePass(0.97, groups);
    expect(r.passed).toBe(false);
    expect(r.failedGroups).toEqual(["Bad"]);
  });
  it("ignores groups with fewer than 2 questions", () => {
    const groups = groupStats([item({ correct: false, credit: 0 })], () => [{ key: "x", label: "X" }]);
    expect(evaluatePass(0.97, groups).passed).toBe(true);
  });
});

describe("needsWork", () => {
  it("lists only groups below the bar, weakest first, at most three", () => {
    const mk = (label: string, credit: number) =>
      groupStats([item({ credit, correct: credit > 0 })], () => [{ key: label, label }])[0];
    const weak = needsWork([mk("A", 0.2), mk("B", 0.99), mk("C", 0.6), mk("D", 0.4), mk("E", 0.1)]);
    expect(weak.map((w) => w.label)).toEqual(["E", "A", "D"]);
  });
  it("explains confident errors", () => {
    const g = groupStats(
      [item({ correct: false, credit: 0 }), item({ correct: false, credit: 0 }), item()],
      () => [{ key: "g", label: "G" }],
    )[0];
    expect(explainGroup(g)).toBe("2 of 3 wrong, 2 marked Sure");
  });
  it("explains a single slow answer in a group that is otherwise fast", () => {
    const g = groupStats(
      [item(), item(), item(), item({ activeMs: 200_000, credit: 0.7 })],
      () => [{ key: "g", label: "G" }],
    )[0];
    expect(explainGroup(g)).toBe("right, but 1 of 4 ran over the target time");
  });
  it("explains hesitation", () => {
    const g = groupStats(
      [item(), item({ sureness: "not_sure", credit: 0.6 })],
      () => [{ key: "g", label: "G" }],
    )[0];
    expect(explainGroup(g)).toBe("right, but 1 of 2 not marked Sure");
  });
  it("explains right-but-slow", () => {
    const g = groupStats([item({ activeMs: 90_000, credit: 0.85 })], () => [{ key: "g", label: "G" }])[0];
    expect(explainGroup(g)).toBe("right, but 1.5× slower than target");
  });
});

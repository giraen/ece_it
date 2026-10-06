import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import {
  evaluatePass,
  explainGroup,
  groupStats,
  itemCredit,
  median,
  needsWork,
  overallStats,
  SURENESS_ORDER,
  targetSecPerItem,
  type ScoredItem,
} from "../scoring";

const item = (over: Partial<ScoredItem> = {}): ScoredItem => ({
  answered: true,
  correct: true,
  sureness: "sure",
  activeMs: 30_000,
  targetSec: 120,
  credit: 1,
  ...over,
});

describe("the time for one item", () => {
  it("is the total time divided by the number of items", () => {
    expect(targetSecPerItem(3600, 30)).toBe(120); // a topic quiz: 1 hour, 30 items, 2 minutes each
    expect(targetSecPerItem(3600, 25)).toBe(144);
    expect(targetSecPerItem(3600, 40)).toBe(90);
    expect(targetSecPerItem(3600, 50)).toBe(72);
    expect(targetSecPerItem(18_000, 200)).toBe(90); // a longer quiz chosen by the person
  });
  it("is rounded to a whole second", () => {
    expect(targetSecPerItem(3600, 35)).toBe(103);
  });
  it("is 0 when there is nothing to divide", () => {
    expect(targetSecPerItem(3600, 0)).toBe(0);
    expect(targetSecPerItem(0, 30)).toBe(0);
  });
});

describe("the settings", () => {
  it("rank wise guess above not sure, and a lucky guess at nothing", () => {
    const c = CONFIG.sureCredit;
    expect(c.sure).toBeGreaterThan(c.wise_guess);
    expect(c.wise_guess).toBeGreaterThan(c.not_sure);
    expect(c.not_sure).toBeGreaterThan(c.just_guessed);
    expect(c.just_guessed).toBe(0);
  });
  it("list the answers from most to least confident", () => {
    expect(SURENESS_ORDER).toEqual(["sure", "wise_guess", "not_sure", "just_guessed"]);
  });
  it("give a topic quiz 25 to 50 items in one hour", () => {
    const t = CONFIG.quiz.topic;
    expect([t.minItems, t.maxItems, t.totalMinutes]).toEqual([25, 50, 60]);
    expect(targetSecPerItem(t.totalMinutes * 60, t.defaultItems)).toBe(120);
  });
});

describe("itemCredit", () => {
  it("is the credit for how sure you were, when right", () => {
    expect(itemCredit({ correct: true, sureness: "sure" })).toBe(1);
    expect(itemCredit({ correct: true, sureness: "wise_guess" })).toBe(0.6);
    expect(itemCredit({ correct: true, sureness: "not_sure" })).toBe(0.4);
  });
  it("gives a wise guess more than not sure", () => {
    expect(itemCredit({ correct: true, sureness: "wise_guess" })).toBeGreaterThan(
      itemCredit({ correct: true, sureness: "not_sure" }),
    );
  });
  it("gives nothing for wrong answers, lucky guesses, or no answer", () => {
    expect(itemCredit({ correct: false, sureness: "sure" })).toBe(0);
    expect(itemCredit({ correct: true, sureness: "just_guessed" })).toBe(0);
    expect(itemCredit({ correct: true, sureness: undefined })).toBe(0);
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
  it("adds up the time spent and the time the quiz was meant to take", () => {
    const o = overallStats([item({ activeMs: 50_000, targetSec: 120 }), item({ activeMs: 200_000, targetSec: 120 })]);
    expect(o.totalMs).toBe(250_000);
    expect(o.targetMs).toBe(240_000);
  });
  it("does not let time change the score", () => {
    const fast = overallStats(Array.from({ length: 10 }, () => item({ activeMs: 5_000 })));
    const slow = overallStats(Array.from({ length: 10 }, () => item({ activeMs: 900_000 })));
    expect(slow.credit).toBe(fast.credit);
    expect(slow.credit).toBe(1);
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
  it("still reports pace as a statistic, without touching credit", () => {
    const [g] = groupStats([item({ activeMs: 240_000 }), item({ activeMs: 60_000 })], () => [{ key: "g", label: "G" }]);
    expect(g.medianRatio).toBeCloseTo(1.25); // median of 2.0 and 0.5
    expect(g.overTarget).toBe(1);
    expect(g.credit).toBe(1);
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
  it("explains wrong answers, and the ones marked Sure", () => {
    const g = groupStats([item({ correct: false, credit: 0 }), item({ correct: false, credit: 0 }), item()], () => [
      { key: "g", label: "G" },
    ])[0];
    expect(explainGroup(g)).toBe("2 of 3 wrong, 2 marked Sure");
  });
  it("explains doubt in a group where everything was right", () => {
    const g = groupStats(
      [item(), item({ sureness: "wise_guess", credit: 0.6 }), item({ sureness: "not_sure", credit: 0.4 })],
      () => [{ key: "g", label: "G" }],
    )[0];
    expect(explainGroup(g)).toBe("right, but 2 of 3 not marked Sure");
  });
  it("explains a right answer that was just a guess", () => {
    const g = groupStats([item(), item({ sureness: "just_guessed", credit: 0 })], () => [{ key: "g", label: "G" }])[0];
    expect(explainGroup(g)).toBe("right, but 1 of 2 just a guess");
  });
  it("never blames time for lost credit", () => {
    const g = groupStats([item({ activeMs: 900_000, sureness: "not_sure", credit: 0.4 })], () => [
      { key: "g", label: "G" },
    ])[0];
    expect(explainGroup(g)).not.toMatch(/slow|target|time/i);
  });
});

describe("what the 95% bar means in practice", () => {
  // Every answer is right and Sure, except for `count` answers that lost credit.
  const quiz = (total: number, count: number, kind: "wrong" | "wise_guess" | "not_sure") => {
    const lost: ScoredItem =
      kind === "wrong"
        ? item({ correct: false, credit: 0, sureness: undefined })
        : item({ sureness: kind, credit: CONFIG.sureCredit[kind] });
    return overallStats(Array.from({ length: total }, (_, i) => (i < count ? lost : item()))).credit;
  };
  const groups = groupStats([item(), item()], () => [{ key: "g", label: "G" }]);
  const passes = (total: number, count: number, kind: "wrong" | "wise_guess" | "not_sure") =>
    evaluatePass(quiz(total, count, kind), groups).passed;

  it("30 items: one wrong answer is fine, two is not", () => {
    expect(passes(30, 1, "wrong")).toBe(true); // 0.967
    expect(passes(30, 2, "wrong")).toBe(false); // 0.933
  });
  it("30 items: three wise guesses are fine, four are not", () => {
    expect(passes(30, 3, "wise_guess")).toBe(true); // 0.96
    expect(passes(30, 4, "wise_guess")).toBe(false); // 0.947
  });
  it("30 items: two 'Not sure' answers are fine, three are not", () => {
    expect(passes(30, 2, "not_sure")).toBe(true); // 0.96
    expect(passes(30, 3, "not_sure")).toBe(false); // 0.94
  });
  it("25 items, the smallest topic quiz: one wrong answer is fine, two is not", () => {
    expect(passes(25, 1, "wrong")).toBe(true); // 0.96
    expect(passes(25, 2, "wrong")).toBe(false); // 0.92
  });
  it("50 items, the largest topic quiz: two wrong answers are fine, three are not", () => {
    expect(passes(50, 2, "wrong")).toBe(true); // 0.96
    expect(passes(50, 3, "wrong")).toBe(false); // 0.94
  });
  it("a perfect run is worth exactly 1", () => {
    expect(quiz(30, 0, "wrong")).toBe(1);
  });
});
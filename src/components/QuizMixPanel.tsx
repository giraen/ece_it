"use client";

import {
  DEFAULT_MIX,
  EQUAL_MIX,
  EVERY_TIER_FROM,
  MIX_MAX,
  MIX_MIN,
  TIERS,
  saveSourceMix,
  sharesOf,
  useSourceMix,
  type Mix,
} from "@/lib/sourceMix";

const same = (a: Mix, b: Mix) => TIERS.every((t) => a[t.id] === b[t.id]);

/** How much of a quiz each kind of source gets. Each kind with questions is still included in a quiz. */
export default function QuizMixPanel() {
  const mix = useSourceMix();
  const share = sharesOf(mix);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Quizzes draw more from the kinds higher up, but every kind that has questions still appears, so none is left
        out. A quiz of {EVERY_TIER_FROM} or more questions always includes at least one from each. Inside each kind,
        questions you missed and ones you have not seen yet still come first.
      </p>
      <ul className="space-y-3">
        {TIERS.map((t) => (
          <li key={t.id} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3">
            <label htmlFor={`mix-${t.id}`} className="text-sm">
              <span className="font-medium">{t.label}</span>
              <span className="block text-xs text-muted">{t.about}</span>
            </label>
            <input
              id={`mix-${t.id}`}
              type="range"
              min={MIX_MIN}
              max={MIX_MAX}
              step={1}
              value={mix[t.id]}
              aria-valuetext={`${share[t.id]} percent`}
              onChange={(e) => void saveSourceMix({ ...mix, [t.id]: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
            <span className="text-right text-sm font-medium tabular-nums">{share[t.id]}%</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={same(mix, DEFAULT_MIX)}
          onClick={() => void saveSourceMix(DEFAULT_MIX)}
        >
          Back to the default
        </button>
        <button
          type="button"
          className="btn"
          disabled={same(mix, EQUAL_MIX)}
          onClick={() => void saveSourceMix(EQUAL_MIX)}
        >
          Make them equal
        </button>
      </div>
    </div>
  );
}
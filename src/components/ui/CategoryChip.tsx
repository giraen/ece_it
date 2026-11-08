import { FIXED_CATEGORIES } from "@/lib/bank/categories";

export type CategoryKey = (typeof FIXED_CATEGORIES)[number]["key"];

/** The colour classes for each category. Written out in full so Tailwind keeps them. */
export const CATEGORY_STYLE: Record<CategoryKey, { chip: string; bar: string; text: string }> = {
  geas: { chip: "bg-geas-soft text-geas", bar: "bg-geas", text: "text-geas" },
  esat: { chip: "bg-esat-soft text-esat", bar: "bg-esat", text: "text-esat" },
  elex: { chip: "bg-elex-soft text-elex", bar: "bg-elex", text: "text-elex" },
  math: { chip: "bg-math-soft text-math", bar: "bg-math", text: "text-math" },
};

/** What each code stands for. */
export const CATEGORY_TITLE: Record<CategoryKey, string> = {
  geas: "General Engineering & Applied Sciences",
  esat: "Electronic Systems & Technologies",
  elex: "Electronics Engineering",
  math: "Engineering Mathematics",
};

/** The category a name or a path such as "MATH › Algebra" belongs to, when it is one of the four. */
export function categoryKey(nameOrPath: string | undefined): CategoryKey | null {
  const first = (nameOrPath ?? "").split("›")[0].trim().toLowerCase();
  return FIXED_CATEGORIES.find((c) => c.name.toLowerCase() === first)?.key ?? null;
}

/** A short coloured code, such as MATH, that marks which category something is in. */
export default function CategoryChip({ name, className = "" }: { name: string | undefined; className?: string }) {
  const key = categoryKey(name);
  const label = (name ?? "").split("›")[0].trim();
  if (!label) return null;
  return (
    <span
      title={key ? CATEGORY_TITLE[key] : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold ${
        key ? CATEGORY_STYLE[key].chip : "bg-paper text-muted"
      } ${className}`}
    >
      {label}
    </span>
  );
}

"use client";

/** The page numbers to show: always the first and last, and a few around the current one, with … between gaps. */
function pageList(page: number, pages: number): (number | "gap-a" | "gap-b")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const nums = Array.from(keep)
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const out: (number | "gap-a" | "gap-b")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push(i === 1 ? "gap-a" : "gap-b");
    out.push(n);
  });
  return out;
}

interface Props {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

/** Previous / numbered / Next buttons with a "21–40 of 124" label, lined up at the right. Hidden when one page is enough. */
export default function Pagination({ page, pages, total, pageSize, onChange }: Props) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-end gap-2 py-2">
      <span className="mr-1 text-sm tabular-nums text-muted">
        {from}–{to} of {total}
      </span>
      <button className="btn py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {pageList(page, pages).map((n) =>
        typeof n === "string" ? (
          <span key={n} className="px-1 text-sm text-muted" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={n}
            className={`btn min-w-8 py-1 tabular-nums ${n === page ? "border-accent bg-accent-soft text-accent" : ""}`}
            aria-current={n === page ? "page" : undefined}
            aria-label={`Page ${n}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ),
      )}
      <button className="btn py-1" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
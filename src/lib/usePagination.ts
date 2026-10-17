"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const PAGE_SIZE = 12;

/**
 * Splits a list into pages. The current page lives in the address (?page=3), so a refresh, the Back button, and
 * a copied link all land on the same page. Page 1 is left out of the address to keep it clean.
 * Call `reset` when a search or filter changes so you start again at page 1.
 */
export function usePagination<T>(items: T[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const wanted = Math.floor(Number(params.get("page"))) || 1;
  const page = Math.min(Math.max(1, wanted), pages);

  const setPage = (n: number) => {
    const target = Math.min(Math.max(1, n), pages);
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };

  const reset = () => {
    if (params.has("page")) setPage(1);
  };

  const start = (page - 1) * PAGE_SIZE;
  return { page, pages, setPage, reset, pageItems: items.slice(start, start + PAGE_SIZE), pageSize: PAGE_SIZE };
}
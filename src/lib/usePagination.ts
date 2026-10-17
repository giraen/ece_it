"use client";

import { useState } from "react";

export const PAGE_SIZE = 20;

/**
 * Splits a list into pages. The page is remembered for this scope for the browser session, so coming back from
 * the editor lands on the same page. `resetKey` sends you back to page 1 when the search or tag filter changes.
 */
export function usePagination<T>(items: T[], scopeKey: string, resetKey: string) {
  const storeKey = `ece:page:${scopeKey}`;
  const [state, setState] = useState<{ page: number; resetKey: string }>(() => {
    let saved = 1;
    try {
      saved = Number(sessionStorage.getItem(storeKey)) || 1;
    } catch {
      /* storage can be blocked, page 1 is fine */
    }
    return { page: saved, resetKey };
  });

  // A changed search or filter starts over at page 1.
  const current = state.resetKey === resetKey ? state.page : 1;
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, current), pages);

  const setPage = (n: number) => {
    const next = Math.min(Math.max(1, n), pages);
    setState({ page: next, resetKey });
    try {
      sessionStorage.setItem(storeKey, String(next));
    } catch {
      /* ignore */
    }
  };

  const start = (page - 1) * PAGE_SIZE;
  return { page, pages, setPage, pageItems: items.slice(start, start + PAGE_SIZE), pageSize: PAGE_SIZE };
}
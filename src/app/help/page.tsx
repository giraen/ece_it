"use client";

import dynamic from "next/dynamic";

// The examples roll random numbers, so the page is drawn in the browser only.
const HelpPage = dynamic(() => import("@/components/HelpPage"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Loading…</p>,
});

export default function Page() {
  return <HelpPage />;
}
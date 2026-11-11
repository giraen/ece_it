"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ExtractPage from "@/components/extract/ExtractPage";
import MemoryExtract from "@/components/extract/MemoryExtract";
import LoadingScreen from "@/components/layout/LoadingScreen";

/** Extract reads questions or memory cards from pasted text. */
function Inner() {
  const memory = useSearchParams().get("mode") === "memory";
  const tabs = [
    { on: !memory, href: "/extract", label: "Questions" },
    { on: memory, href: "/extract?mode=memory", label: "Memory cards" },
  ];
  return (
    <>
      <nav aria-label="What to extract" className="mb-6 inline-flex overflow-hidden rounded-md border border-line">
        {tabs.map((t, i) => (
          <Link
            key={t.label}
            href={t.href}
            replace
            aria-current={t.on ? "page" : undefined}
            className={`px-4 py-1.5 text-sm ${i > 0 ? "border-l border-line" : ""} ${
              t.on ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {memory ? <MemoryExtract /> : <ExtractPage />}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Inner />
    </Suspense>
  );
}

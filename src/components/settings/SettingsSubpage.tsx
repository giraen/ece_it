"use client";

import Link from "next/link";
import InfoTip from "@/components/ui/InfoTip";

interface Props {
  title: string;
  /** What the page is for. It floats from the "i" next to the title, so the page itself stays short. */
  tip: React.ReactNode;
  children: React.ReactNode;
  /** For pages that show things side by side. */
  wide?: boolean;
}

/** The frame of a page that opens from Settings: a way back, the title, and the content. */
export default function SettingsSubpage({ title, tip, children, wide = false }: Props) {
  return (
    <div className={`${wide ? "max-w-5xl" : "max-w-3xl"} space-y-5`}>
      <div>
        <Link href="/settings" className="text-sm text-muted underline">
          ← Settings
        </Link>
        <div className="mt-2 flex items-center gap-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          <InfoTip>{tip}</InfoTip>
        </div>
      </div>
      {children}
    </div>
  );
}

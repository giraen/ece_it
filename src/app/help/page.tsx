"use client";

import dynamic from "next/dynamic";
import LoadingScreen from "@/components/LoadingScreen";

// The examples roll random numbers, so the page is drawn in the browser only.
const HelpPage = dynamic(() => import("@/components/HelpPage"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

export default function Page() {
  return <HelpPage />;
}
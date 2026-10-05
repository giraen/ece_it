import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "ECE Review",
  description: "Board exam review with timed quizzes, sureness ratings, and mastery tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          // Runs before the page paints, so the saved theme is applied with no white flash.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('ece:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
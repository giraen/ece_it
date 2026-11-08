import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "ECE Review",
  description: "Board exam review with timed quizzes, sureness ratings, and mastery tracking.",
};

// Lets the page reach under a phone's rounded corners and home bar, so the tab bar can pad itself to stay clear of them.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          // Runs before the page paints, so the saved theme is applied with no white flash.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('ece:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t);if(localStorage.getItem('ece:motion')==='full')document.documentElement.setAttribute('data-motion','full')}catch(e){}})()",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

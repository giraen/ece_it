import type { Metadata } from "next";
import "./globals.css";

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
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
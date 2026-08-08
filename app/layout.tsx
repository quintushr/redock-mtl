import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Analytics from "@/components/Analytics";
import { DocumentLanguage } from "@/components/LocaleProvider";
import { THEME_SCRIPT } from "@/components/ThemeProvider";
import { STATIC_METADATA } from "@/lib/i18n/static-metadata";
import { CONFIG_SCRIPT } from "@/lib/runtime-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * French, and static.
 *
 * There is no server to negotiate a language with, and a static export ships
 * one document. The interface switches language in the browser and updates the
 * document's `lang` as it goes; the metadata a crawler or a share card reads
 * stays in the product's default language.
 */
export const metadata: Metadata = {
  title: STATIC_METADATA.title,
  description: STATIC_METADATA.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      // The served value, and the one `serverTheme()` in ThemeProvider returns,
      // so the prerendered markup and React's first render agree on light.
      data-theme="light"
      /*
        And this is what makes that agreement survive the script below.
        Hydration does not compare React's first render against the *served*
        HTML, it compares it against the live DOM — which THEME_SCRIPT has
        already rewritten to `dark` for a reader who chose dark. The attribute
        therefore diverges exactly when the script does its job, and the warning
        fires on the one page load the script exists to fix.

        Suppression rather than a fix, because there is nothing to fix: an
        attribute deliberately mutated before hydration is the case this
        attribute is for. It is shallow — this element's own attributes and text
        and nothing else — so a genuine mismatch anywhere in the tree below still
        reports.

        `lang` falls under it as well, without needing to: DocumentLanguage
        writes it from an effect, which runs after hydration and therefore has
        nothing to disagree with.
      */
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Before paint, before React. The document ships light, so without this
          a reader who chose dark watches a white panel for as long as hydration
          takes — on a cold load over a slow connection that is a second of the
          wrong colour, not a frame.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />

        {/*
          Where the external services live, asked for before the bundle parses.

          Nothing in this document renders differently because of it — the panel,
          the tagline and the empty state depend on no URL — so this deliberately
          does not block paint. What it does is make the answer already in hand by
          the time the first request wants one.

          No `<link rel="preload">` beside it, deliberately: the request is
          `cache: "no-store"`, so a preloaded response could not be reused and the
          hint would buy a second round trip rather than save one. See the note on
          CONFIG_SCRIPT in lib/runtime-config.ts.
        */}
        <script dangerouslySetInnerHTML={{ __html: CONFIG_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <DocumentLanguage>{children}</DocumentLanguage>

        {/*
          Audience measurement, and on most deployments — including this one
          until someone decides otherwise — a component that renders nothing and
          does nothing.

          Deliberately *not* a script in the head beside the other two. Those are
          there because the theme and the service URLs have to be settled before
          paint; a page-view count has to be settled before nothing at all, and
          the tracker is the one thing on this page that must never be in the way
          of the first frame. It is appended from an effect, async and defer,
          with Umami's own automatic tracking switched off. See
          components/Analytics.tsx and lib/analytics.ts.
        */}
        <Analytics />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DocumentLanguage } from "@/components/LocaleProvider";
import { THEME_SCRIPT } from "@/components/ThemeProvider";
import { STATIC_METADATA } from "@/lib/i18n/static-metadata";
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
      // The served value. The script below corrects it before first paint from
      // the reader's stored choice, or from the system when they have none;
      // declaring it here keeps the prerendered markup and React's first render
      // agreeing on light, which is what stops a hydration mismatch.
      data-theme="light"
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
      </head>
      <body className="min-h-full flex flex-col">
        <DocumentLanguage>{children}</DocumentLanguage>
      </body>
    </html>
  );
}

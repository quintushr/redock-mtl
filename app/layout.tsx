import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DocumentLanguage } from "@/components/LocaleProvider";
import { t } from "@/lib/strings";
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
  title: t.app.title,
  description: t.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DocumentLanguage>{children}</DocumentLanguage>
      </body>
    </html>
  );
}

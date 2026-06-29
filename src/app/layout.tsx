import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG Archive",
  description: "Archivio della tua collezione di carte TCG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
            <span className="font-semibold text-gray-900 tracking-tight">TCG Archive</span>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                Dashboard
              </Link>
              <Link href="/collezione" className="text-gray-600 hover:text-gray-900 transition-colors">
                Collezione
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">{children}</main>
      </body>
    </html>
  );
}

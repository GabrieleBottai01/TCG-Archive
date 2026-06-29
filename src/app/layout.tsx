import type { Metadata } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG Archive",
  description: "Archivio della tua collezione di carte TCG",
};

// Set theme + language before paint to avoid a flash of the wrong theme/lang.
const bootInit = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');var l=localStorage.getItem('lang');if(l==='en'||l==='it')document.documentElement.lang=l;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${orbitron.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootInit }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteNav />
        <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

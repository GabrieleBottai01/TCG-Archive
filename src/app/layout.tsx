import type { Metadata } from "next";
import { Orbitron, Space_Grotesk } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
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

// Set the theme class before paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <span className="relative h-9 w-9 overflow-hidden rounded-full ring-1 ring-silver/40">
                <Image
                  src="/logo-light.jpg"
                  alt=""
                  fill
                  sizes="36px"
                  className="object-cover dark:hidden"
                  priority
                />
                <Image
                  src="/logo-dark.jpg"
                  alt=""
                  fill
                  sizes="36px"
                  className="hidden object-cover dark:block"
                  priority
                />
              </span>
              <span className="font-display text-lg font-bold text-fg">
                TCG<span className="text-primary"> Archive</span>
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/" className="text-muted hover:text-fg transition-colors">
                Dashboard
              </Link>
              <Link
                href="/collezione"
                className="text-muted hover:text-fg transition-colors"
              >
                Collezione
              </Link>
            </nav>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

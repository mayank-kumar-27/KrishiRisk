import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import "./globals.css";

// Self-hosted at build time by next/font (no requests to Google at runtime).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

const TITLE = "KrishiRisk | Agricultural Yield Prediction & Climate Stress Modeling";
const DESCRIPTION = "Predict yields. Map climate risk. Protect smallholders.";

export const metadata: Metadata = {
  metadataBase: new URL("https://krishirisk.vercel.app"),
  title: { default: TITLE, template: "%s · KrishiRisk" },
  description: DESCRIPTION,
  applicationName: "KrishiRisk",
  authors: [{ name: "Mayank Kumar and team" }],
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "KrishiRisk", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#07110d" },
  ],
};

// Before first paint: apply the saved theme (else the OS setting) and flag that JS is running,
// which enables the scroll-reveal styles. Without JS nothing is ever hidden.
const bootScript = `(function(){var e=document.documentElement;e.classList.add("js");try{var t=localStorage.getItem("kr-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;e.classList.toggle("dark",d)}catch(x){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[2000] focus:rounded focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main" className="mx-auto max-w-[90rem] px-4 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

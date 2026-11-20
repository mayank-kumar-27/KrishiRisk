import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

const TITLE = "KrishiRisk — Agricultural Yield Prediction & Climate Stress Modeling";
const DESCRIPTION = "Predict yields. Map climate risk. Protect smallholders.";

export const metadata: Metadata = {
  metadataBase: new URL("https://krishirisk.vercel.app"),
  title: { default: TITLE, template: "%s · KrishiRisk" },
  description: DESCRIPTION,
  applicationName: "KrishiRisk",
  authors: [{ name: "Mayank Kumar" }],
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "KrishiRisk", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

// Sets the theme class before first paint (saved choice, else the OS setting) to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("kr-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[2000]">
          Skip to content
        </a>
        <Nav />
        <main id="main" className="mx-auto max-w-7xl px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-sm text-ink-2 sm:flex-row sm:justify-between">
            <span>
              <span className="font-medium text-ink">KrishiRisk</span> — Predict yields. Map climate risk. Protect smallholders.
            </span>
            <span>Mayank Kumar · B.Tech CSE, UPES Dehradun · DVI Final Project</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

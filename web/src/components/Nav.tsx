"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/risk-map", label: "Risk Map" },
  { href: "/explore", label: "Explore" },
  { href: "/simulator", label: "What-If" },
  { href: "/model", label: "Model" },
  { href: "/about", label: "About" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" aria-label="KrishiRisk home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-accent/10 font-medium text-accent-ink" : "text-ink-2 hover:bg-line/60 hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}

"use client";

import { AnimatePresence, motion, useScroll, useSpring } from "motion/react";
import { BookOpen, BrainCircuit, ChartLine, FileDown, LayoutDashboard, Map as MapIcon, Menu, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/risk-map", label: "Risk Map", icon: MapIcon },
  { href: "/explore", label: "Explore", icon: ChartLine },
  { href: "/simulator", label: "What-If", icon: SlidersHorizontal },
  { href: "/model", label: "Model", icon: BrainCircuit },
  { href: "/about", label: "About", icon: BookOpen },
];

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });
  return (
    <motion.div aria-hidden="true" className="absolute inset-x-0 -bottom-px h-px origin-left bg-brand" style={{ scaleX }} />
  );
}

export default function Nav() {
  // Static hosts may serve /index.html or /model.html; normalise so the active link (and hydration) match.
  const path = (usePathname() || "/").replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "") || "/";
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="no-print sticky top-0 z-[1000] border-b border-line bg-surface/95 backdrop-blur-xl">
      {/* Row 1 - identity and status */}
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="KrishiRisk home" className="flex shrink-0 items-center gap-3 rounded">
          <Logo size={26} />
          <span className="hidden border-l border-line pl-3 text-[11px] leading-[14px] text-muted lg:block">
            Agricultural Yield Prediction
            <br />& Climate Stress Modeling
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="tag hidden lg:inline-flex">
            <span className="pulse-dot" aria-hidden="true" />
            Open data: NASA POWER · data.gov.in · SoilGrids
          </span>
          <span className="tag hidden xl:inline-flex">DVI Team Project</span>
          <Link href="/report" aria-current={isActive("/report") ? "page" : undefined} className="btn btn-primary hidden sm:inline-flex">
            <FileDown size={15} aria-hidden="true" /> Download report
          </Link>
          <Link href="/report" aria-label="Download report" title="Download report" className="btn btn-primary !w-9 !px-0 sm:hidden">
            <FileDown size={16} aria-hidden="true" />
          </Link>
          <ThemeToggle />
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Row 2 - module tabs (tablet and up) */}
      <div className="hidden border-t border-line md:block">
        <div className="mx-auto flex h-10 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <nav aria-label="Main" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
            {LINKS.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-[13px] transition-colors ${
                    active ? "font-semibold text-white" : "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded bg-brand-solid"
                      transition={{ type: "spring", stiffness: 460, damping: 38 }}
                    />
                  )}
                  <l.icon size={14} className="relative" aria-hidden="true" />
                  <span className="relative">{l.label}</span>
                </Link>
              );
            })}
          </nav>
          <p className="hidden shrink-0 font-mono text-[11px] text-muted xl:block">
            Mayank Kumar and team · B.Tech CSE, UPES Dehradun
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Main"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <ul className="mx-auto grid max-w-7xl gap-0.5 px-4 py-2">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={isActive(l.href) ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded px-3 py-2.5 text-sm font-medium ${
                      isActive(l.href) ? "bg-brand-solid text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <l.icon size={16} aria-hidden="true" />
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/report" className="flex items-center gap-2.5 rounded px-3 py-2.5 text-sm font-medium text-brand-ink hover:bg-surface-2">
                  <FileDown size={16} aria-hidden="true" />
                  Download report
                </Link>
              </li>
            </ul>
            <p className="border-t border-line px-4 py-2.5 font-mono text-[11px] text-muted">
              Open data: NASA POWER · data.gov.in · SoilGrids
            </p>
          </motion.nav>
        )}
      </AnimatePresence>
      <ScrollProgress />
    </header>
  );
}

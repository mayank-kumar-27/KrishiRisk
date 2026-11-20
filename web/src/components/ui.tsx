"use client";

import { motion } from "motion/react";
import { Lightbulb, TriangleAlert } from "lucide-react";
import { useId, useRef, type ComponentType, type ReactNode } from "react";
import { Skeleton } from "./anim";

type Icon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export function Eyebrow({ children, icon: I }: { children: ReactNode; icon?: Icon }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-semibold text-brand-ink shadow-sm backdrop-blur">
      {I ? <I size={14} /> : <span className="pulse-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, icon, title, lead, children }: {
  eyebrow?: string;
  icon?: Icon;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="hero-in mb-8 max-w-3xl">
      {eyebrow && <Eyebrow icon={icon}>{eyebrow}</Eyebrow>}
      <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
      {lead && <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">{lead}</p>}
      {children}
    </header>
  );
}

export function Card({ title, subtitle, icon: I, children, className = "", action, hover = false }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: Icon;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  hover?: boolean;
}) {
  return (
    <section className={`card min-w-0 p-5 sm:p-6 ${hover ? "card-hover" : ""} ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {I && (
              <span className="icon-chip h-9 w-9 shrink-0">
                <I size={18} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-display text-base font-bold leading-tight sm:text-lg">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex gap-3 rounded-xl bg-brand-soft/60 p-3 text-sm text-ink-2 dark:bg-brand-soft/40">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" />
      <p>
        <span className="font-semibold text-ink">Insight: </span>
        {children}
      </p>
    </div>
  );
}

export function Callout({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  return (
    <div role="note" className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ${tone === "warn" ? "bg-warn-bg text-warn-ink" : "bg-surface-2 text-ink-2"}`}>
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-ink-2/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Pill-style single choice with an animated selection indicator. */
export function Segmented({ label, value, onChange, options, id }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  id: string;
}) {
  // Radio-group keyboard pattern: one tab stop (the selected pill); arrow keys move and select.
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = options.findIndex((o) => o.value === value);
  const tabIdx = activeIdx >= 0 ? activeIdx : 0;
  const move = (i: number, dir: number) => {
    const j = (i + dir + options.length) % options.length;
    onChange(options[j].value);
    refs.current[j]?.focus();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted" id={`${id}-label`}>{label}</span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-line bg-surface-2/70 p-1">
        {options.map((o, i) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={i === tabIdx ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className={`relative rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${id}`}
                  className="absolute inset-0 rounded-xl border border-line bg-surface shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading data">
      <Skeleton height={44} className="max-w-md" />
      <Skeleton height={20} className="max-w-2xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton height={120} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
      <Skeleton height={360} />
    </div>
  );
}

export function NoData({ error }: { error?: string }) {
  return (
    <div className="card border-dashed p-10 text-center">
      <p className="font-display text-lg font-bold">Data not available yet</p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-2">
        The analysis pipeline has not exported this file. Run{" "}
        <code className="rounded-md bg-surface-2 px-1.5 py-0.5">python analysis/run_all.py</code> to generate{" "}
        <code className="rounded-md bg-surface-2 px-1.5 py-0.5">web/public/data/</code>.
      </p>
      {error && <p className="mt-2 text-xs text-muted">({error})</p>}
    </div>
  );
}

export function CategoryBadge({ category, color }: { category: string | null | undefined; color?: string }) {
  if (!category) return <span className="text-sm text-muted">No data</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {category}
    </span>
  );
}

export function StatTile({ icon: I, label, value, note }: { icon?: Icon; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-2">
        {I && (
          <span className="icon-chip h-8 w-8">
            <I size={16} />
          </span>
        )}
        {label}
      </div>
      <div className="font-display mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{value}</div>
      {note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

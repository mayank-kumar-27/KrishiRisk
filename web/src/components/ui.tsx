"use client";

import { motion } from "motion/react";
import { Lightbulb, TriangleAlert } from "lucide-react";
import { useId, useRef, type ComponentType, type ReactNode } from "react";
import { Skeleton } from "./anim";

type Icon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/** Monospaced status chip with a live pip (or an icon). */
export function Eyebrow({ children, icon: I }: { children: ReactNode; icon?: Icon }) {
  return (
    <span className="inline-flex items-center gap-2 rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-brand-ink">
      {I ? <I size={13} /> : <span className="pulse-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Small uppercase caption used above metrics and sections. */
export function Micro({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`micro ${className}`}>{children}</p>;
}

export function PageHeader({ eyebrow, icon, title, lead, meta, children }: {
  eyebrow?: string;
  icon?: Icon;
  title: ReactNode;
  lead?: ReactNode;
  /** short monospaced facts shown as tags under the lead */
  meta?: ReactNode[];
  children?: ReactNode;
}) {
  return (
    <header className="hero-in mb-6 border-b border-line pb-6">
      {eyebrow && <Eyebrow icon={icon}>{eyebrow}</Eyebrow>}
      <h1 className="mt-3 max-w-4xl text-[28px] font-semibold leading-9 tracking-[-0.02em] sm:text-4xl sm:leading-[44px] sm:tracking-[-0.025em]">
        {title}
      </h1>
      {lead && <p className="mt-2.5 max-w-3xl text-[15px] leading-6 text-ink-2">{lead}</p>}
      {meta && meta.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {meta.map((m, i) => (
            <span key={i} className="tag">{m}</span>
          ))}
        </div>
      )}
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
    <section className={`card flex h-full min-w-0 flex-col p-4 sm:p-5 ${hover ? "card-hover" : ""} ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {I && (
              <span className="icon-chip mt-0.5 h-7 w-7 shrink-0">
                <I size={15} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold leading-6 tracking-[-0.01em]">{title}</h2>}
              {subtitle && <p className="font-mono text-[11px] leading-4 text-muted">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto pt-4">
    <div className="flex gap-2.5 rounded-r border-l-2 border-brand bg-brand-soft px-3 py-2.5 text-[13px] leading-5 text-ink-2">
      <Lightbulb size={15} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden="true" />
      <p>
        <span className="mr-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-brand-ink">Insight</span>
        {children}
      </p>
    </div>
    </div>
  );
}

export function Callout({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  return (
    <div role="note" className={`flex gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] leading-5 ${tone === "warn" ? "border-warn-line bg-warn-bg text-warn-ink" : "border-line bg-surface-2 text-ink-2"}`}>
      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
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
      <label htmlFor={id} className="micro">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-44 rounded border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink-2/50 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-[var(--brand-ring)]"
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

/** Segmented single choice (radio group) with an animated selection indicator. */
export function Segmented({ label, value, onChange, options, id }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  id: string;
}) {
  // Radio-group keyboard pattern: one tab stop (the selected option); arrow keys move and select.
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = options.findIndex((o) => o.value === value);
  const tabIdx = activeIdx >= 0 ? activeIdx : 0;
  const move = (i: number, dir: number) => {
    const j = (i + dir + options.length) % options.length;
    onChange(options[j].value);
    refs.current[j]?.focus();
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="micro" id={`${id}-label`}>{label}</span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
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
              className={`relative h-8 rounded px-3 text-[13px] font-medium transition-colors ${active ? "text-white" : "text-ink-2 hover:text-ink"}`}
            >
              {active && (
                <motion.span
                  layoutId={`seg-${id}`}
                  className="absolute inset-0 rounded bg-brand-solid"
                  transition={{ type: "spring", stiffness: 460, damping: 38 }}
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
      <Skeleton height={36} className="max-w-md" />
      <Skeleton height={18} className="max-w-2xl" />
      <div className="grid gap-3 md:grid-cols-4">
        <Skeleton height={112} />
        <Skeleton height={112} />
        <Skeleton height={112} />
        <Skeleton height={112} />
      </div>
      <Skeleton height={360} />
    </div>
  );
}

export function NoData({ error }: { error?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface p-10 text-center">
      <p className="text-base font-semibold">Data not available yet</p>
      <p className="mx-auto mt-2 max-w-lg text-[13px] text-ink-2">
        The analysis pipeline has not exported this file. Run{" "}
        <code className="tag">python analysis/run_all.py</code> to generate{" "}
        <code className="tag">web/public/data/</code>.
      </p>
      {error && <p className="mt-2 font-mono text-[11px] text-muted">({error})</p>}
    </div>
  );
}

/** Risk telemetry chip: tinted background, 6px status pip and monospaced uppercase label. */
export function CategoryBadge({ category, color }: { category: string | null | undefined; color?: string }) {
  if (!category) return <span className="font-mono text-[11px] text-muted">No data</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink"
      style={{ background: color ? `color-mix(in srgb, ${color} 18%, transparent)` : "var(--surface-2)" }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {category}
    </span>
  );
}

/** KPI telemetry module: uppercase caption, icon chip, large monospaced value. */
export function StatTile({ icon: I, label, value, note }: { icon?: Icon; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="card card-hover h-full p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="micro pt-0.5">{label}</p>
        {I && (
          <span className="icon-chip h-7 w-7 shrink-0">
            <I size={15} />
          </span>
        )}
      </div>
      <div className="num mt-3 text-[28px] font-semibold leading-8">{value}</div>
      {note && <p className="mt-1.5 text-xs leading-[18px] text-muted">{note}</p>}
    </div>
  );
}

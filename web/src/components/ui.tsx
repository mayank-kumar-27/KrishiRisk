"use client";

import type { ReactNode } from "react";

export function PageHeader({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {lead && <p className="mt-2 max-w-3xl text-ink-2">{lead}</p>}
    </div>
  );
}

export function Card({ title, children, className = "", action }: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Insight({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-accent pl-3 text-sm text-ink-2">
      <span className="font-semibold text-ink">Insight: </span>
      {children}
    </p>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-40 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-muted">Loading data…</p>;
}

export function NoData({ error }: { error?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <p className="font-medium">Data not available yet</p>
      <p className="mt-1 text-sm text-ink-2">
        The analysis pipeline has not exported this file. Run <code className="rounded bg-line/60 px-1">python analysis/run_all.py</code>{" "}
        to generate <code className="rounded bg-line/60 px-1">web/public/data/</code>.
      </p>
      {error && <p className="mt-2 text-xs text-muted">({error})</p>}
    </div>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
      {children}
    </div>
  );
}

export function CategoryBadge({ category, color }: { category: string | null | undefined; color?: string }) {
  if (!category) return <span className="text-muted">No data</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {category}
    </span>
  );
}

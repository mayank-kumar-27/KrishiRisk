"use client";

// Lightweight motion helpers. Everything here degrades to static content when the visitor
// prefers reduced motion, and nothing is hidden in the server HTML (reveal styles only apply
// once the `js` class is on <html>, see layout.tsx and globals.css).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

/** Becomes true the first time the element scrolls into view (and stays true). */
export function useInViewOnce<T extends Element>(rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}

/** Fades/slides its children in when scrolled into view. */
export function Reveal({ children, delay = 0, variant = "up", className = "" }: {
  children: ReactNode;
  delay?: number;
  variant?: "up" | "scale" | "left";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal reveal-${variant} ${className}`} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

const formatters = new Map<number, Intl.NumberFormat>();
function nf(decimals: number) {
  if (!formatters.has(decimals)) {
    formatters.set(decimals, new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return formatters.get(decimals)!;
}

export function formatNumber(v: number, decimals = 0, signed = false): string {
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return sign + nf(decimals).format(Math.abs(v));
}

/** Counts up from 0 to `value` the first time it scrolls into view. */
export function CountUp({ value, decimals = 0, signed = false, duration = 1600, className = "" }: {
  value: number;
  decimals?: number;
  signed?: boolean;
  duration?: number;
  className?: string;
}) {
  const [ref, inView] = useInViewOnce<HTMLSpanElement>("0px 0px -4% 0px");
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      setShown(value * (1 - Math.pow(1 - k, 4))); // ease-out quart
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, value, duration]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`} aria-label={formatNumber(value, decimals, signed)}>
      {formatNumber(shown, decimals, signed)}
    </span>
  );
}

/** Smoothly animates from the previous value to a new one (for live controls). */
export function useTweened(target: number | null, duration = 450): number | null {
  const reduce = usePrefersReducedMotion();
  const [val, setVal] = useState<number | null>(target);
  const current = useRef<number | null>(target);
  useEffect(() => {
    const from = current.current;
    if (target == null || from == null || reduce) {
      current.current = target;
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const v = from + (target - from) * (1 - Math.pow(1 - k, 3));
      current.current = v;
      setVal(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, duration]);
  return val;
}

export function Skeleton({ height = 240, className = "" }: { height?: number; className?: string }) {
  return <div className={`skeleton w-full ${className}`} style={{ height }} aria-hidden="true" />;
}

/** Mounts its children only once scrolled near, so chart entry animations play in view. */
export function WhenVisible({ height, children }: { height: number; children: ReactNode }) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>("0px 0px 5% 0px");
  return (
    <div ref={ref} style={{ minHeight: height }}>
      {inView ? children : <Skeleton height={height} />}
    </div>
  );
}

"use client";

import { Moon, Sun } from "lucide-react";

// Icons switch with the `dark` class via CSS, so the right one is shown from the first paint
// (no flash and no hydration mismatch).
export default function ThemeToggle() {
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("kr-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable (private mode) - theme still switches for this visit */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Moon size={16} aria-hidden="true"
        className="absolute rotate-0 scale-100 opacity-100 transition-all duration-300 dark:-rotate-90 dark:scale-50 dark:opacity-0" />
      <Sun size={16} aria-hidden="true"
        className="absolute rotate-90 scale-50 opacity-0 transition-all duration-300 dark:rotate-0 dark:scale-100 dark:opacity-100" />
    </button>
  );
}

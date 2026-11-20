// KrishiRisk logo - a leaf whose midrib is a rising/falling yield line.

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={className}>
      <path d="M10 54C10 28 26 10 54 10C54 36 38 54 12 54Z" className="fill-green-700 dark:fill-green-500" />
      <path
        d="M6 58L14 50"
        strokeWidth={4}
        strokeLinecap="round"
        className="stroke-green-700 dark:stroke-green-500"
      />
      <polyline
        points="14,48 23,37 30,42 39,27 46,20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="46" cy="20" r="3.5" className="fill-amber-400" />
    </svg>
  );
}

export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-tight">
        Krishi<span className="text-green-700 dark:text-green-500">Risk</span>
      </span>
    </span>
  );
}

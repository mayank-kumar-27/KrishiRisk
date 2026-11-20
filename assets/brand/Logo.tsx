// KrishiRisk logo — leaf merged with a rising/falling line chart.
// Copy to web/src/components/Logo.tsx once the Next.js app exists.
// Leaf colours adapt via Tailwind `dark:` classes; the wordmark uses currentColor.

type LogoProps = {
  /** Height of the mark in px. */
  size?: number;
  /** Show the "KrishiRisk" wordmark next to the mark. */
  withWordmark?: boolean;
  className?: string;
};

export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="KrishiRisk"
      className={className}
    >
      <path
        d="M10 54C10 28 26 10 54 10C54 36 38 54 12 54Z"
        className="fill-green-700 dark:fill-green-500"
      />
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

export default function Logo({ size = 32, withWordmark = true, className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      {withWordmark && (
        <span className="font-semibold tracking-tight text-current" style={{ fontSize: size * 0.6 }}>
          Krishi<span className="text-green-700 dark:text-green-500">Risk</span>
        </span>
      )}
    </span>
  );
}

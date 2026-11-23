// KrishiRisk logo: field, crop, rainfall, heat and a rising yield chart over the map of India.
// Source artwork: assets/brand/logo.svg (cropped copy in public/logo.svg; PNG renders for small sizes).
import Image from "next/image";

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src={size > 256 ? "/logo-512.png" : "/logo-256.png"}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
      priority={size <= 48}
    />
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

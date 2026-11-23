import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import Logo from "./Logo";

const PAGES = [
  { href: "/risk-map", label: "Risk Map" },
  { href: "/explore", label: "Explore" },
  { href: "/simulator", label: "What-If Simulator" },
  { href: "/model", label: "Model" },
  { href: "/about", label: "About & data" },
  { href: "/report", label: "Download report" },
];

const SOURCES = [
  { href: "https://power.larc.nasa.gov/", label: "NASA POWER" },
  { href: "https://www.data.gov.in/", label: "data.gov.in" },
  { href: "https://www.isric.org/explore/soilgrids", label: "ISRIC SoilGrids" },
  { href: "https://github.com/datameet/maps", label: "DataMeet maps" },
];

export default function Footer() {
  return (
    <footer className="no-print mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr] lg:px-8">
        <div>
          <Logo size={24} />
          <p className="mt-3 max-w-sm text-[13px] leading-5 text-ink-2">
            Predict yields. Map climate risk. Protect smallholders. An open, reproducible look at how rainfall, heat and
            soil shape crop yields, district by district.
          </p>
          <p className="mt-4 text-[13px] leading-5 text-ink-2">
            <span className="font-medium text-ink">Mayank Kumar and team</span> · B.Tech CSE, UPES Dehradun
            <br />
            Data Visualization &amp; Interpretation · Team Project
          </p>
        </div>
        <div>
          <h2 className="micro">Modules</h2>
          <ul className="mt-3 space-y-2 text-[13px]">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="text-ink-2 transition-colors hover:text-brand-ink">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="micro">Open data</h2>
          <ul className="mt-3 space-y-2 text-[13px]">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-brand-ink">
                  {s.label} <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-2 px-4 py-3 font-mono text-[11px] text-muted sm:px-6 lg:px-8">
          <span>Sources: data.gov.in crop statistics · NASA POWER daily climate · ISRIC SoilGrids · Census 2011 boundaries</span>
          <span>KrishiRisk · static build, no tracking</span>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import Logo from "./Logo";

const PAGES = [
  { href: "/risk-map", label: "Risk Map" },
  { href: "/explore", label: "Explore" },
  { href: "/simulator", label: "What-If Simulator" },
  { href: "/model", label: "Model" },
  { href: "/about", label: "About & data" },
];

const SOURCES = [
  { href: "https://power.larc.nasa.gov/", label: "NASA POWER" },
  { href: "https://www.data.gov.in/", label: "data.gov.in" },
  { href: "https://www.isric.org/explore/soilgrids", label: "ISRIC SoilGrids" },
  { href: "https://github.com/datameet/maps", label: "DataMeet maps" },
];

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-ink-2">
            Predict yields. Map climate risk. Protect smallholders. An open, reproducible look at how rainfall, heat and
            soil shape crop yields — district by district.
          </p>
          <p className="mt-4 text-sm text-ink-2">
            <span className="font-medium text-ink">Mayank Kumar &amp; Team</span> · B.Tech CSE, UPES Dehradun
            <br />
            Data Visualization &amp; Interpretation — Team Project
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="text-ink-2 transition-colors hover:text-ink">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Open data</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-ink-2 transition-colors hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

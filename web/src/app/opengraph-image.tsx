import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Rendered at build time (static export), so the logo is read from public/ and embedded.
const LOGO = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "logo-512.png")).toString("base64")}`;

export const dynamic = "force-static";
export const alt = "KrishiRisk | Agricultural Yield Prediction & Climate Stress Modeling";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "72px", background: "#f8fafc", color: "#0f172a", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse (OG) needs a plain img */}
          <img src={LOGO} width={150} height={150} alt="" />
          <div style={{ display: "flex", fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
            Krishi<span style={{ color: "#15803d" }}>Risk</span>
          </div>
        </div>
        <div style={{ marginTop: 36, fontSize: 40, color: "#475569" }}>
          Agricultural Yield Prediction &amp; Climate Stress Modeling
        </div>
        <div style={{ marginTop: 20, fontSize: 34, color: "#166534" }}>
          Predict yields. Map climate risk. Protect smallholders.
        </div>
      </div>
    ),
    size,
  );
}

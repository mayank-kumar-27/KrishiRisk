import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "KrishiRisk — Agricultural Yield Prediction & Climate Stress Modeling";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "72px", background: "#f9f9f7", color: "#0b0b0b", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="140" height="140" viewBox="0 0 64 64">
            <path d="M10 54C10 28 26 10 54 10C54 36 38 54 12 54Z" fill="#15803d" />
            <path d="M6 58L14 50" stroke="#15803d" strokeWidth="4" strokeLinecap="round" />
            <polyline points="14,48 23,37 30,42 39,27 46,20" fill="none" stroke="#ffffff" strokeWidth="4"
              strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="46" cy="20" r="3.5" fill="#fbbf24" />
          </svg>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
            Krishi<span style={{ color: "#15803d" }}>Risk</span>
          </div>
        </div>
        <div style={{ marginTop: 36, fontSize: 40, color: "#52514e" }}>
          Agricultural Yield Prediction &amp; Climate Stress Modeling
        </div>
        <div style={{ marginTop: 20, fontSize: 34, color: "#1c5cab" }}>
          Predict yields. Map climate risk. Protect smallholders.
        </div>
      </div>
    ),
    size,
  );
}

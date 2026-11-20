import type { NextConfig } from "next";

// Fully static site: `next build` writes plain HTML/JS to out/, and all data is read at runtime
// from public/data/*.json (produced by analysis/06_export_web.py). No server code.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Builds run from this folder (locally and as Vercel's Root Directory = web). Pin it as the
  // workspace root so Next.js ignores lockfiles in parent folders.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

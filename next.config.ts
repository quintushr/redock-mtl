import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zero operating cost (constitution principle I): the build must be a plain
  // directory of static assets with nothing expecting a server at runtime.
  // `next build` emits `out/`, which is what Cloudflare Pages serves.
  // `next dev` errors on any feature requiring a server, so the constraint is
  // enforced during development rather than discovered at deploy time.
  output: "export",
};

export default nextConfig;

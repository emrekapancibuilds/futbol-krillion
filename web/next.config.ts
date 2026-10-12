import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: {},
  outputFileTracingRoot: process.cwd(),
  webpack(config, { dev }) {
    if (dev && process.env.FK_DISABLE_BUILD_CACHE === "true") config.cache = false;
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }, { source: "/billing/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  // The game data (answers, name index) is read from disk by the API routes and must ship with them.
  outputFileTracingIncludes: { "/api/**": ["./data/**"] },
};

export default config;

import type { NextConfig } from "next";

const config: NextConfig = {
  // The game data (answers, name index) is read from disk by the API routes and must ship with them.
  outputFileTracingIncludes: { "/api/**": ["./data/**"] },
};

export default config;

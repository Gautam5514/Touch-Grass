import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for production. Dev mode skips it so runtime ids like /adventure/12/ work without pre-rendering.
  ...(process.env.NODE_ENV === "production" ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  // E2E builds go to a separate folder so they never overwrite the production export.
  ...(process.env.WQ_DIST_DIR ? { distDir: process.env.WQ_DIST_DIR } : {}),
  turbopack: {
    root: __dirname,
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};

export default nextConfig;

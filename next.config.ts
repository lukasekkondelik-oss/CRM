import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Celé CRM je per-uživatel dynamické (session v cookies), cacheComponents by přinášelo jen složitost.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

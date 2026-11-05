import type { NextConfig } from "next";

// cacheComponents is off on purpose: almost every page is per-user and reads the
// session cookie, so there is nothing to cache and Suspense-everywhere adds risk.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/i/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/mcp/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }, { key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;

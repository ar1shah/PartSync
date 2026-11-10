import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Soft-nav between admin pages reuses the RSC payload for 30s so bouncing
  // around the sidebar feels instant after the first load of each route.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // Part image uploads (JPEG/PNG/WebP) are capped at 15 MB in the storage
    // bucket; keep the server action body limit a little above that.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;

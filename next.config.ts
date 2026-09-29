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
  },
};

export default nextConfig;

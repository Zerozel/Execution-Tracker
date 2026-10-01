import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Skip ESLint during builds. Run `npm run check` locally.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

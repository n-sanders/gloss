import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker build asks for a self-contained server in .next/standalone; local builds stay as they are, for `npm start`.
  output: process.env.GLOSS_STANDALONE === "1" ? "standalone" : undefined,
  serverExternalPackages: ["linkedom"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// No Content-Security-Policy is set. If one is added, its `img-src` must include
// the Supabase project host (https://<ref>.supabase.co) because /api/media
// redirects photos there when Supabase Storage is configured.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@navopulse/shared"],
  serverExternalPackages: ["pg", "exceljs"],
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

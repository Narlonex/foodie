import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const pwaHeaders = [
  {
    source: "/sw.js",
    headers: [
      { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      { key: "Service-Worker-Allowed", value: "/" },
    ],
  },
  {
    source: "/manifest.webmanifest",
    headers: [
      { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
    ],
  },
  {
    source: "/offline.html",
    headers: [
      { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
    ],
  },
  {
    source: "/icons/:path*",
    headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
  },
];

const nextConfig: NextConfig = {
  // Keep Turbopack rooted at this project; otherwise a lockfile in a parent
  // directory can make Next.js scan the whole home directory.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      ...pwaHeaders,
    ];
  },
};

export default nextConfig;

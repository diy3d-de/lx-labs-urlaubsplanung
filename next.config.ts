import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP nach dem Next.js-Leitfaden „Without Nonces“; bewusst ohne upgrade-insecure-requests,
// das bei Betrieb über HTTP (z. B. im LAN) alle Anfragen auf HTTPS umbiegen würde.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone", // für die Desktop-App (Electron) und schlankere Docker-Images
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

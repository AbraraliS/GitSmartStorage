import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from GitHub avatars and raw content
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },
  // Increase body size limit for chunk uploads (up to 5 MB per chunk)
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  // Security headers applied to every route
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Restrict referrer info sent to third parties
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable access to sensitive browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Content Security Policy — allow only same-origin + GitHub for images
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",   // Next.js needs inline scripts
              "style-src 'self' 'unsafe-inline'",    // Tailwind CSS
              "img-src 'self' data: https://avatars.githubusercontent.com https://raw.githubusercontent.com",
              "connect-src 'self' https://api.github.com",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

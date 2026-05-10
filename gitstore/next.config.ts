import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from GitHub avatars and raw content
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },
  // Chunk uploads use PUT /api/upload/chunk — Route Handler, NOT Server Action.
  // Server Actions and Route Handlers have SEPARATE body size limits.
  // An 80MB chunk + 33% base64 expansion + JSON wrapper ≈ 115MB payload.
  // We set 150MB to provide headroom.
  experimental: {
    serverActions: {
      bodySizeLimit: "150mb",
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
          // HSTS — only for production
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Content Security Policy — allow only same-origin + GitHub for images
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://avatars.githubusercontent.com https://raw.githubusercontent.com",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "frame-src 'none'",
              "object-src 'none'",
              "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
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

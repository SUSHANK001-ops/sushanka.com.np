import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * The site loads: an inline theme-init script, Umami analytics
 * (cloud.umami.is), Google AdSense (googlesyndication / doubleclick), and
 * images from Cloudinary, Spotify, GitHub/Google avatars. Fonts are
 * self-hosted by next/font at build time.
 *
 * 'unsafe-inline' is required for the inline theme script + Tailwind/editor
 * inline styles and for AdSense. XSS via injected inline scripts is separately
 * mitigated by server-side HTML sanitization of blog content (lib/sanitizeBlog).
 * The directives below still block clickjacking (frame-ancestors), base-tag
 * hijacking (base-uri), plugin/object injection (object-src) and exfiltration
 * to arbitrary origins (connect-src / img-src allowlists).
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cloud.umami.is https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://i.scdn.co https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://sushanka.com.np https://*.googlesyndication.com https://*.doubleclick.net",
  "font-src 'self' data:",
  "connect-src 'self' https://cloud.umami.is https://api-gateway.umami.dev https://*.googlesyndication.com https://*.doubleclick.net",
  "frame-src https://*.googlesyndication.com https://*.doubleclick.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sushanka.com.np',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'i.scdn.co', // Spotify album art
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com', // GitHub avatars (auth)
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google avatars (auth)
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

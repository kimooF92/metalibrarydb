import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve("."),
  },
  outputFileTracingExcludes: {
    "*": [
      "./worker/**",
      "./scripts/**",
      "./tests/**",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
      "./node_modules/@playwright/**",
      "./node_modules/@depot/**",
      "./node_modules/@trigger.dev/build/**",
      "./.playwright_profile*/**",
    ],
  },
  images: {
    remotePatterns: [
      // Facebook / Meta CDN (thumbnails, images from Ad Library)
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.facebook.com" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbsbx.com" },
      // Supabase Storage (signed thumbnails)
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
      // Backblaze B2 & Catbox Storage
      { protocol: "https", hostname: "**.backblazeb2.com" },
      { protocol: "https", hostname: "files.catbox.moe" },
    ],
  },
};

export default nextConfig;

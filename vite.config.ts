import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Bug fix: this repo is on Tailwind v4, which moved its PostCSS plugin
    // to a separate @tailwindcss/postcss package — postcss.config.js was
    // still using the old v3-style `tailwindcss: {}` PostCSS plugin entry,
    // which v4's tailwindcss package no longer supports directly and fails
    // the build outright ("It looks like you're trying to use tailwindcss
    // directly as a PostCSS plugin"). @tailwindcss/vite (the officially
    // recommended v4 integration) was already installed as a dependency
    // but never actually wired in here — adding it as a Vite plugin
    // processes Tailwind directly, so postcss.config.js no longer needs to
    // touch Tailwind at all (see the accompanying postcss.config.js
    // change, which now only runs autoprefixer).
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // Must be an absolute root path, not "./" — this app is served from
  // nested routes (e.g. /auth/callback for email confirmation links), and
  // a relative base resolves asset URLs relative to the CURRENT path
  // instead of the site root. That caused /auth/callback to request
  // assets/manifest.json from a nonexistent nested path, 404, and fall
  // through to the SPA catch-all (index.html) — which is why the JS
  // bundle loaded as HTML and the app never mounted (black screen).
  base: "/",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "autoUpdate" silently activates a new service worker on the next
      // load instead of stalling on the old cached version until the user
      // manually closes every tab — right for an internal business tool
      // where staff shouldn't have to think about "updating the app".
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Shree Balaji Traders",
        short_name: "SBT",
        description: "Business management app for Shree Balaji Traders",
        theme_color: "#2F5AA8",
        background_color: "#EAF1FB",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML) so the app still opens
        // to a usable UI with no connection — fetchAll() then surfaces its
        // existing loadError state for the actual data, same as any other
        // network hiccup today.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        // mapbox-gl's chunk is ~1.9MB — bump Workbox's default 2MB precache
        // ceiling slightly so it doesn't get silently skipped from the shell.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // GET requests to the API: try the network first (real-time data
            // matters more than a stale cache for a live business app), but
            // fall back to whatever was last cached if the network is down —
            // this is what lets an already-loaded screen stay readable
            // offline instead of blanking out.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && /\/api\//.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "sbt-api-get-cache",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "sbt-fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});

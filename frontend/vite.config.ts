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
        theme_color: "#F2F3F5",
        background_color: "#F2F3F5",
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
        // Keep the map library OUT of the offline cache. It is ~1.9 MB of script and its stylesheet,
        // loaded on demand only when a map opens (lib/mapbox.ts), and a map can't work offline
        // anyway (its tiles come from the internet). Precaching it made every phone download it
        // up front, on every app update. scripts/check-precache.mjs fails the build if it creeps back.
        globIgnores: ["**/mapbox-gl-*"],
        // Workbox's own default (2 MB): a file bigger than this is skipped from the precache with a
        // warning, rather than quietly making every install heavier.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
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

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["favicon.svg", "pwa-icon.svg"],
    manifest: {
      name: "KMS Kemenhub",
      short_name: "KMS Kemenhub",
      description: "Pusat Pengetahuan Perhubungan",
      theme_color: "#0B1F3A",
      background_color: "#F4F8FB",
      display: "standalone",
      icons: [{ src: "pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
    workbox: {
      navigateFallback: "index.html",
      runtimeCaching: [
        {
          urlPattern: /\/api\/assets\/(?:homepage|featured|search\/suggestions|\d+(?:\/related)?)(?:\?.*)?$/,
          handler: "NetworkFirst",
          options: { cacheName: "kms-public-api", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 } },
        },
        {
          urlPattern: /\/uploads\/.*\.(?:png|jpe?g|webp|svg)$/i,
          handler: "CacheFirst",
          options: { cacheName: "kms-thumbnails", expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 } },
        },
      ],
    },
  })],
});

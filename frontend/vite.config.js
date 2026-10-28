import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { officePreviewPlugin } from './officePreviewPlugin.mjs';

const remoteGoogleFontImports = [
  /@import\s*(?:url\(\s*)?['"]https:\/\/fonts\.googleapis\.com\/[^'"]+['"]\s*\)?\s*;/gi,
  /@import\s+url\(\s*https:\/\/fonts\.googleapis\.com\/[^)]+\)\s*;/gi,
];

const stripRemoteFontImports = () => ({
  name: "kms-strip-remote-font-imports",
  enforce: "pre",
  transform(source, id) {
    if (!id.split("?", 1)[0].endsWith(".css")) return null;

    const css = remoteGoogleFontImports.reduce(
      (result, pattern) => result.replace(pattern, ""),
      source,
    );

    return css === source ? null : { code: css, map: null };
  },
});

// https://vite.dev/config/
export default defineConfig({
  cacheDir: '.vite-cache',
  optimizeDeps: { include: ['xlsx','jszip'] },
  plugins: [tailwindcss(), react(), stripRemoteFontImports(), officePreviewPlugin(), VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["LOGO_KEMENTERIAN_PERHUBUNGAN_REPUBLIK_INDONESIA.png", "pwa-icon.svg"],
    manifest: {
      name: "KMS Kemenhub",
      short_name: "KMS Kemenhub",
      description: "Pusat Pengetahuan Perhubungan",
      theme_color: "#0B1F3A",
      background_color: "#F4F8FB",
      display: "standalone",
      icons: [{ src: "LOGO_KEMENTERIAN_PERHUBUNGAN_REPUBLIK_INDONESIA.png", sizes: "any", type: "image/png", purpose: "any" }],
    },
    workbox: {
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      navigateFallback: "index.html",
      navigateFallbackDenylist: [/^\/office-preview\//],
      // Office libraries are fetched only when a preview is opened, not on the homepage.
      globIgnores: ['**/office-preview/**','**/sheet.worker-*.js'],
      runtimeCaching: [
        { urlPattern: /\/api\/internal-assets(?:\/|\?|$)/, handler: "NetworkOnly" },
        {
          // Visibility is controlled by Admin; never show an offline cached
          // featured section after it has been disabled.
          urlPattern: /\/api\/assets\/featured(?:\?.*)?$/,
          handler: "NetworkOnly",
        },
        {
          urlPattern: /\/api\/announcements(?:\?.*)?$/,
          handler: "NetworkFirst",
          options: { cacheName: "kms-public-announcements", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 } },
        },
        {
          urlPattern: /\/api\/assets\/(?:homepage|search\/suggestions|\d+(?:\/related)?)(?:\?.*)?$/,
          handler: "NetworkFirst",
          options: { cacheName: "kms-public-api", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 } },
        },
      ],
    },
  })],
});

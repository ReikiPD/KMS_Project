import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
  plugins: [tailwindcss(), react(), stripRemoteFontImports(), VitePWA({
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
      runtimeCaching: [
        {
          urlPattern: /\/api\/announcements(?:\?.*)?$/,
          handler: "NetworkFirst",
          options: { cacheName: "kms-public-announcements", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 } },
        },
        {
          urlPattern: /\/api\/assets\/(?:homepage|featured|search\/suggestions|\d+(?:\/related)?)(?:\?.*)?$/,
          handler: "NetworkFirst",
          options: { cacheName: "kms-public-api", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 } },
        },
      ],
    },
  })],
});

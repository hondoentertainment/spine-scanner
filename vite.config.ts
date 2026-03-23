import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function normalizeBasePath(value?: string): string {
  if (!value) return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function createSiteAssetsPlugin(base: string, siteUrl?: string): Plugin {
  return {
    name: 'spine-scanner-site-assets',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', siteUrl ?? '');
    },
    apply: 'build',
    generateBundle() {
      const normalizedSiteUrl = siteUrl?.replace(/\/$/, '');
      const rootUrl = normalizedSiteUrl ? new URL(base, `${normalizedSiteUrl}/`).toString() : null;
      const sitemapSource = normalizedSiteUrl
        ? [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${rootUrl}</loc>`,
          '    <changefreq>weekly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '</urlset>',
        ].join('\n')
        : [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '</urlset>',
        ].join('\n');

      const robotsLines = ['User-agent: *', 'Allow: /'];
      if (normalizedSiteUrl) {
        robotsLines.push(`Sitemap: ${new URL(`${base}sitemap.xml`, `${normalizedSiteUrl}/`).toString()}`);
      }

      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `${sitemapSource}\n` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robotsLines.join('\n')}\n` });
    },
  };
}

const base = normalizeBasePath(process.env.VITE_BASE_PATH ?? (process.env.VERCEL ? '/' : '/spine-scanner/'));
const siteUrl = process.env.VITE_SITE_URL;

export default defineConfig({
  plugins: [
    react(),
    createSiteAssetsPlugin(base, siteUrl),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['vite.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'SpineScanner',
        short_name: 'SpineScanner',
        description: 'Digitize and manage your book library with OCR and barcode scanning',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'vite.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Exclude WASM core files from precache because they are large and browser caching is enough.
        globIgnores: ['**/tesseract/*.wasm.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-core',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-lang',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-cdn',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\/books\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-books-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/openlibrary\.org\/api\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'openlibrary-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/books\.google\.com\/books\/content/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          scanner: ['tesseract.js', '@zxing/browser', '@zxing/library', 'react-webcam'],
        },
      },
    },
  },
});

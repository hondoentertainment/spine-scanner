import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const base = process.env.VERCEL ? '/' : '/spine-scanner/';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'SpineScanner',
        short_name: 'SpineScanner',
        description: 'Digitize and manage your book library with OCR and barcode scanning',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/spine-scanner/',
        start_url: '/spine-scanner/',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Exclude WASM core files from precache — they're ~3.8 MB each and
        // the browser only needs ONE variant. Let the HTTP cache handle them.
        globIgnores: ['**/tesseract/*.wasm.js'],
        runtimeCaching: [
          {
            // Tesseract.js WASM core files from CDN (loaded by the OCR web worker)
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-core',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Tesseract.js language trained data from CDN
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-lang',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Any other jsdelivr CDN requests (fallback)
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
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// TEMP: ngrok tunnel for sharing the dev/preview server. Remove when the Vercel URL is live.
const allowedHosts = ['itunes-anything-crouton.ngrok-free.dev']

// https://vite.dev/config/
export default defineConfig({
  server: { allowedHosts },
  preview: { allowedHosts },
  plugins: [
    react(),
    tailwindcss(),
    // SPEC: 05 — installable, offline-first PWA.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tubig Patas',
        short_name: 'Tubig Patas',
        description: 'Know when the water comes back, and where to get it until then.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#fdfdfd',
        background_color: '#fdfdfd',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Every route opens offline from the cached app shell.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})

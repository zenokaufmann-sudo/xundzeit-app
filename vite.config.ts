import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/xundzeit-app/'

// Nur im Build: Im Dev-Modus braucht React-Refresh Inline-Skripte.
const csp: Plugin = {
  name: 'xundzeit-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://api.github.com https://api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com",
      "manifest-src 'self'",
      "worker-src 'self'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join('; ')
    return html.replace(
      '<!--csp-->',
      `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    )
  },
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    csp,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: `${BASE}index.html`,
      },
      manifest: {
        id: BASE,
        name: 'Xundzeit',
        short_name: 'Xundzeit',
        description: 'Persönliches Kopfweh- und Gesundheitstagebuch',
        lang: 'de-CH',
        start_url: `${BASE}?tab=heute`,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f2ec',
        theme_color: '#f4f2ec',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})

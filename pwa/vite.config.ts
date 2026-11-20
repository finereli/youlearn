// pwa-kit: shell/vite.config.ts v11
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { buildNumber, pwaOptions } from './shared/build/pwa-build'

// Seams: MAJOR, the manifest, includeAssets.
const MAJOR = 1

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(buildNumber(MAJOR)),
  },
  resolve: {
    alias: { $shared: fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  plugins: [
    svelte(),
    VitePWA(
      pwaOptions({
        includeAssets: ['icons/*.png'],
        manifest: {
          name: 'YouLearn',
          short_name: 'YouLearn',
          description: 'Wild Kratts without the rest of YouTube.',
          lang: 'en',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // Video wants landscape, the episode grid works either way.
          orientation: 'any',
          background_color: '#0f2e2c',
          theme_color: '#0f2e2c',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      })
    ),
  ],
})

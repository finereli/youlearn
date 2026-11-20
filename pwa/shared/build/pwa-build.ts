// Build-time half of the update flow, imported by vite.config.ts:
//
//   import { buildNumber, pwaOptions } from '../shared/build/pwa-build'
//   export default defineConfig({
//     define: { __BUILD__: JSON.stringify(buildNumber(1)) },
//     plugins: [svelte(), VitePWA(pwaOptions({ manifest: {…}, includeAssets: ['fonts/*.woff2', 'icons/*.png'] }))],
//   })
//
// Version = MAJOR.<build>, where the build is the total commit count (CI must
// check out full history: fetch-depth 0) - so it counts up by itself and never
// needs deciding. Bump MAJOR by hand only for a rewrite; nobody consumes it,
// it's a label people can read back to you. BUILD_NUMBER overrides the count -
// that's how you exercise the update flow locally, where every build would
// otherwise carry the same number.

import { execSync } from 'node:child_process'

// Structural types only - shared/ may sit outside the app's node_modules, so
// this file must not import from vite-plugin-pwa (the object it returns is
// what VitePWA() expects).
export interface PwaManifest {
  name: string
  short_name: string
  description?: string
  lang?: string
  dir?: 'ltr' | 'rtl'
  start_url?: string
  scope?: string
  display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser'
  orientation?: 'portrait' | 'landscape' | 'any' | 'natural' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary'
  background_color?: string
  theme_color?: string
  icons: Array<{ src: string; sizes: string; type?: string; purpose?: 'any' | 'maskable' | 'monochrome' | 'any maskable' }>
  [key: string]: unknown
}

export function buildNumber(major = 1): string {
  let build = process.env.BUILD_NUMBER || 'dev'
  if (!process.env.BUILD_NUMBER) {
    try {
      build = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {}
  }
  return `${major}.${build}`
}

// vite-plugin-pwa options. The worker takes over as soon as it has downloaded
// (skipWaiting + clientsClaim); the page decides when to reload into it - see
// lib/updates.svelte.ts, which also does the registration, so nothing is
// injected here (injectRegister: null).
export interface PwaOptionsInput {
  manifest: PwaManifest
  includeAssets?: string[]
  globPatterns?: string[]
  maxFileSizeMB?: number
  navigateFallbackDenylist?: RegExp[]
  workbox?: Record<string, unknown>
}

export function pwaOptions({
  manifest,
  includeAssets = [],
  // Shell only. Media is deliberately not precached: a media element issues
  // no-cors range requests, the worker only sees opaque responses, and an
  // opaque response cannot be sliced - a caching handler breaks seeking
  // rather than enabling offline. Serve media immutable from R2 instead.
  globPatterns = ['**/*.{js,css,html,woff2,png,svg}'],
  maxFileSizeMB = 6,
  // Paths the SPA fallback must never swallow: the API, static asset dirs,
  // reset.html - the out-of-band escape hatch, which is also never
  // precached, so it works even when the app itself is stuck - and the pages
  // a server answers for itself when other software sends the user there:
  // OAuth consent (/oauth/), an MCP endpoint, and /.well-known/ discovery.
  // Without those, any browser with the app installed opens the app at an
  // agent's authorize link instead of the consent page.
  navigateFallbackDenylist = [/^\/api\//, /^\/icons\//, /^\/fonts\//, /^\/reset(\.html)?$/, /^\/oauth\//, /^\/mcp$/, /^\/\.well-known\//],
  workbox = {},
}: PwaOptionsInput) {
  return {
    registerType: 'autoUpdate' as const,
    injectRegister: null,
    includeAssets,
    manifest,
    workbox: {
      globPatterns,
      maximumFileSizeToCacheInBytes: maxFileSizeMB * 1024 * 1024,
      navigateFallback: '/index.html',
      skipWaiting: true,
      clientsClaim: true,
      globIgnores: ['**/node_modules/**/*', '**/reset.html'],
      navigateFallbackDenylist,
      ...workbox,
    },
  }
}

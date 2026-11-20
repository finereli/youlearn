// pwa-kit: updates/lib/updates.svelte.ts v5
// Version-update flow for an installable PWA (spec: reference/updates.md).
//
// The service worker takes over as soon as it has downloaded (skipWaiting +
// clientsClaim, see build/pwa-build.ts), so the newest version always serves the
// next page load and a plain reload can never be stuck on an old one. What
// this module decides is *when the page reloads into it*:
//
//   - a new worker taking over fires `controllerchange`; that is the signal
//     that a new version is installed. If nobody is looking - the app is in
//     the background, or it just launched and hasn't been touched yet - it
//     reloads on the spot. Otherwise `available` turns on, the drawer's
//     reload icon lights up (a tap reloads now), and sending the app to the
//     background applies the update silently.
//     Wire it in main.ts: `updates.init({ canReload: () => !player.playing })`.
//   - the host can veto the silent moments via `canReload` (audio playing,
//     upload in flight); the update just waits for the next one.
//   - the app checks for a new version on launch, on every return to the
//     foreground, and hourly while it stays open.
//   - `reset()` is the manual escape hatch: unregister the worker, wipe the
//     caches, reload from the network. `/reset.html` does the same without
//     any of the app's code (it is served past the worker), for phones that
//     are stuck on a build older than this one.
//
// Registration is done here directly rather than through vite-plugin-pwa's
// `virtual:pwa-register`: its reload-on-update logic only fires for pages
// that were already controlled when they loaded, so after a hard refresh (or
// on a first visit) the update button silently did nothing.

const SW_URL = '/sw.js'
const CHECK_EVERY = 60 * 60 * 1000
// A reload this soon after launch, before the first tap, is invisible.
const QUIET_LAUNCH_MS = 10_000

class Updates {
  available = $state(false)
  resetting = $state(false)
  #reg: ServiceWorkerRegistration | null = null
  #canReload: () => boolean = () => true
  #interacted = false
  #reloading = false

  init({ canReload = () => true }: { canReload?: () => boolean } = {}) {
    if (!('serviceWorker' in navigator)) return
    this.#canReload = canReload

    const markInteracted = () => (this.#interacted = true)
    addEventListener('pointerdown', markInteracted, { capture: true, once: true })
    addEventListener('keydown', markInteracted, { capture: true, once: true })

    // The worker this page considers current. `undefined` until registration
    // resolves; null on a first visit (nothing active yet).
    let current: ServiceWorker | null | undefined

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const controller = navigator.serviceWorker.controller
      // The worker we already knew claiming this page (first install, or a
      // page that loaded past the worker) - nothing new to load.
      if (current === controller) return
      if (current == null) {
        current = controller
        return
      }
      current = controller
      this.available = true
      this.#applyIfUnobtrusive()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check()
      else if (this.available && this.#canReload()) this.apply()
    })
    setInterval(() => document.visibilityState === 'visible' && this.check(), CHECK_EVERY)

    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        this.#reg = reg
        if (current === undefined) current = reg.active
      })
      .catch(() => {})
  }

  #applyIfUnobtrusive() {
    const quietLaunch = !this.#interacted && performance.now() < QUIET_LAUNCH_MS
    if ((document.visibilityState === 'hidden' || quietLaunch) && this.#canReload()) this.apply()
  }

  // Asks the browser to look for a new worker. Safe at any time: a found
  // update installs in the background and only reloads by the rules above.
  check() {
    this.#reg?.update().catch(() => {})
  }

  // Reloads into the version that is already installed.
  apply() {
    if (this.#reloading) return
    this.#reloading = true
    location.reload()
  }

  // Manual escape hatch: forget the worker and every cache, then load
  // everything fresh from the network. Keeps localStorage (login, settings).
  async reset() {
    if (this.#reloading) return
    this.#reloading = true
    this.resetting = true
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {}
    location.reload()
  }
}

export const updates = new Updates()

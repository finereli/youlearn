// Can YouTube's player start on this device? A parental filter like Family
// Link's site list blocks the player's frame (www.youtube-nocookie.com) even
// when youtube.com is allowed: it filters pages and frames, not the images and
// video inside them. Blocked, the frame never says it's ready, and our cover
// hides whatever Chrome draws in it, so we test with a hidden player and, if
// it's blocked, offer to open the player's address in its own tab, where the
// filter shows its own "ask a parent" page.
//
// Runs once on a paired device until it passes (remembered), whenever the
// real player times out, and when she taps Check again.
import { createPlayer } from './youtube'

const KEY = 'yl:player-ok'
const TIMEOUT_MS = 15000
// Any embeddable video will do: an error from YouTube (gone, not embeddable)
// still means the frame loaded, which is all we're testing.
const PROBE_VIDEO = 'nE-hoTqf7X0'
export const PLAYER_HOST = 'www.youtube-nocookie.com'
// Our "All set! Now go back to YouLearn" video (content/all-set/), unlisted.
// "Ask to allow" opens its embed address, so once the filter allows it, the
// page shows that instruction instead of YouTube's 404. Uploaded by Eli, unlisted.
export const ALL_SET_VIDEO = 'StiY9UwlSFg'

export type CheckState = 'unknown' | 'checking' | 'ok' | 'blocked'

function remembered() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

class PlayerCheck {
  state = $state<CheckState>(remembered() ? 'ok' : 'unknown')
  // The last verdict was "blocked": stays true while a re-check runs, so the
  // card doesn't flicker away.
  blocked = $state(false)
  #running: Promise<CheckState> | null = null

  // Once per device, until it passes.
  maybeRun() {
    if (this.state === 'unknown') this.run()
  }

  run(): Promise<CheckState> {
    if (this.#running) return this.#running
    this.state = 'checking'
    console.log('[check] testing the player')
    this.#running = new Promise<CheckState>((resolve) => {
      const el = document.createElement('div')
      const box = document.createElement('div')
      box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none'
      box.setAttribute('aria-hidden', 'true')
      box.appendChild(el)
      document.body.appendChild(box)
      let done = false
      let player: { destroy(): void } | null = null
      const finish = (s: CheckState, why: string) => {
        if (done) return
        done = true
        clearTimeout(timer)
        console.log(`[check] ${s} (${why})`)
        try { player?.destroy() } catch {}
        box.remove()
        this.state = s
        this.blocked = s === 'blocked'
        try {
          if (s === 'ok') localStorage.setItem(KEY, '1')
          else localStorage.removeItem(KEY)
        } catch {}
        this.#running = null
        resolve(s)
      }
      const timer = setTimeout(() => finish('blocked', `no ready in ${TIMEOUT_MS / 1000}s`), TIMEOUT_MS)
      createPlayer(el, PROBE_VIDEO, 0, {
        onReady: () => finish('ok', 'ready'),
        onState: () => {},
        onError: (code) => finish('ok', `YouTube error ${code}, but the frame loaded`),
      })
        .then((p) => (player = p))
        .catch((e) => finish('blocked', `api failed: ${e?.message ?? e}`))
    })
    return this.#running
  }

  constructor() {
    // Coming back from the filter's page (or from anywhere) while blocked:
    // test again by itself, so she doesn't have to know to tap Check again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.blocked && this.state !== 'checking') this.run()
    })
  }

  // The real player timed out: same verdict, no need to test again.
  failed() {
    this.state = 'blocked'
    this.blocked = true
    try { localStorage.removeItem(KEY) } catch {}
  }

  // Open the player's address as a page of its own. A filter shows its block
  // page there, with its way to ask a parent. The address is YouTube's 404
  // ("Something went wrong") once allowed, so approving it opens nothing else;
  // the card tells her that's expected, and coming back re-checks.
  ask() {
    console.log('[check] asking to allow the player')
    const url = ALL_SET_VIDEO ? `https://${PLAYER_HOST}/embed/${ALL_SET_VIDEO}?rel=0` : `https://${PLAYER_HOST}/`
    window.open(url, '_blank', 'noopener')
  }
}

export const playerCheck = new PlayerCheck()

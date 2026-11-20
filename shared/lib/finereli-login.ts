// pwa-kit: login/lib/finereli-login.ts v1
// Sign in through login.finereli.com, the one Google sign-in for every app.
// One instance per app (see account.example.svelte.ts):
//
//   export const login = new FinereliLogin({ storageKey: 'myapp.login' })
//   login.handleRedirect()          // once, at startup
//   login.signIn()                  // from a button
//   makeApi(login)                  // kit api/: bearer + the 401 funnel
//   fetch('/api/x', { headers: { Authorization: `Bearer ${login.token}` } })
//
// Sign-in opens login.finereli.com in a popup. The popup ends back on this
// app's own origin with ?finereli_code=..., and once it is same-origin again
// we can read its URL, take the code and close it. No postMessage, no opener
// needed, and the page URL never changes, so deep links survive. When the
// popup is blocked it falls back to a full redirect that returns to the
// current URL.

export interface LoginUser { sub: string; email: string; name: string; picture: string }
interface Saved { token: string; expiresAt: number; refreshedAt: number; user: LoginUser }

export interface FinereliLoginOptions {
  storageKey: string
  loginOrigin?: string
}

const POPUP_NAME = 'finereli-login'
const PARAM = 'finereli_code'
const REFRESH_AFTER = 86400_000

export class FinereliLogin {
  #key: string
  #login: string
  #saved: Saved | null = null
  #listeners: Array<(u: LoginUser | null) => void> = []

  constructor({ storageKey, loginOrigin = 'https://login.finereli.com' }: FinereliLoginOptions) {
    this.#key = storageKey
    this.#login = loginOrigin
    try {
      const raw = localStorage.getItem(storageKey)
      const saved = raw ? (JSON.parse(raw) as Saved) : null
      if (saved && saved.expiresAt > Date.now()) this.#saved = saved
    } catch {}
  }

  get user(): LoginUser | null { return this.#saved?.user ?? null }
  get token(): string | undefined { return this.#saved?.token }

  onChange(fn: (u: LoginUser | null) => void): () => void {
    this.#listeners.push(fn)
    return () => { this.#listeners = this.#listeners.filter((f) => f !== fn) }
  }

  // Call once at startup. Finishes a redirect sign-in, and refreshes a token
  // that is more than a day old so sessions slide while the app is in use.
  async handleRedirect(): Promise<void> {
    const url = new URL(location.href)
    const code = url.searchParams.get(PARAM)
    const error = url.searchParams.get('finereli_error')
    // Inside our own popup the opener reads the code; leave it alone, unless
    // the opener is gone (then this window finishes the job itself).
    if ((code || error) && window.name === POPUP_NAME && window.opener) return
    if (code || error) {
      url.searchParams.delete(PARAM)
      url.searchParams.delete('finereli_error')
      history.replaceState(history.state, '', url.toString())
    }
    if (code) await this.#redeem(code)
    else if (this.#saved && Date.now() - this.#saved.refreshedAt > REFRESH_AFTER) await this.#refresh()
  }

  signIn({ chooseAccount = false } = {}): Promise<LoginUser | null> {
    const ret = `${location.origin}/`
    const start = this.#startUrl(ret, chooseAccount || this.#signedOut())
    const w = 460, h = 600
    const popup = window.open(start, POPUP_NAME, `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2}`)
    if (!popup) {
      location.href = this.#startUrl(location.href, chooseAccount || this.#signedOut())
      return new Promise(() => {})
    }
    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        if (popup.closed) { clearInterval(timer); resolve(this.user); return }
        let href: string
        try { href = popup.location.href } catch { return } // still on Google or login.finereli.com
        const u = new URL(href)
        if (u.origin !== location.origin) return
        const code = u.searchParams.get(PARAM)
        if (!code && !u.searchParams.has('finereli_error')) return
        clearInterval(timer)
        popup.close()
        if (code) await this.#redeem(code)
        resolve(this.user)
      }, 200)
    })
  }

  // Forget the token here. The next sign-in shows Google's account chooser,
  // so switching accounts works without signing out of every app.
  signOut() {
    this.#set(null)
    try { localStorage.setItem(`${this.#key}.signedOut`, '1') } catch {}
  }

  // A 401 from the app's API: the token is dead. Drop it; the UI shows sign-in.
  handleUnauthorized() {
    if (this.#saved) this.#set(null)
  }

  #signedOut() {
    try { return localStorage.getItem(`${this.#key}.signedOut`) === '1' } catch { return false }
  }

  #startUrl(ret: string, chooseAccount: boolean) {
    const u = new URL('/start', this.#login)
    u.searchParams.set('return', ret)
    if (chooseAccount) u.searchParams.set('prompt', 'select_account')
    return u.toString()
  }

  async #redeem(code: string) {
    const res = await fetch(`${this.#login}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null)
    if (!res?.ok) return
    const data = (await res.json()) as Omit<Saved, 'refreshedAt'>
    try { localStorage.removeItem(`${this.#key}.signedOut`) } catch {}
    this.#set({ ...data, refreshedAt: Date.now() })
  }

  async #refresh() {
    const res = await fetch(`${this.#login}/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.#saved!.token}` },
    }).catch(() => null)
    if (!res) return // offline: keep the token we have
    if (res.status === 401) return this.#set(null)
    if (res.ok) this.#set({ ...((await res.json()) as Omit<Saved, 'refreshedAt'>), refreshedAt: Date.now() })
  }

  #set(saved: Saved | null) {
    const before = this.#saved?.user.sub
    this.#saved = saved
    try {
      if (saved) localStorage.setItem(this.#key, JSON.stringify(saved))
      else localStorage.removeItem(this.#key)
    } catch {}
    if (before !== saved?.user.sub || !saved) for (const fn of this.#listeners) fn(this.user)
  }
}

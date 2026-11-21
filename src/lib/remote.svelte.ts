// The live link to the family's Durable Object, from both ends.
//
// `device` is the child's side: paired once with a code, then it holds a
// socket, counts down to the deadline it was given, and locks at zero. It
// fails closed: locked until told otherwise, and with no connection it keeps
// counting down from the last deadline it heard (saved, so a relaunch
// offline doesn't unlock it).
//
// `family` is the parent's side: the console's view of every child, and the
// commands.
import { WsClient, type ConnState } from '$shared/lib/ws-client'
import { episodeLeft, type ChildState, type ClientMsg, type DeviceInfo, type ServerMsg } from '../../worker/protocol'
import { login } from './account.svelte'
import { startClientLog } from './client-log'
import { playerCheck } from './check.svelte'
import { library } from './library.svelte'
import type { Library } from '../../worker/library'

const DEVICE_KEY = 'yl:device'
const DEADLINE_KEY = 'yl:deadline'

// Her countdown shows for the last five minutes, which is also the longest
// gentle stop a parent can give.
export const COUNTDOWN_FROM = 5 * 60_000

function wsUrl(family: string) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws/${family}`
}

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}
function store(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// One clock tick for everyone who shows a countdown.
class Clock {
  now = $state(Date.now())
  constructor() {
    setInterval(() => (this.now = Date.now()), 250)
  }
}
export const clock = new Clock()

export function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// --- the child's device ------------------------------------------------------

interface Pairing {
  token: string
  family: string
  child: { id: string; name: string }
}

export interface Watch {
  video: string
  t: number
  duration: number
  playing: boolean
}

class Device {
  pairing = $state<Pairing | null>(load(DEVICE_KEY))
  // The deadline on this device's own clock (server deadline minus offset).
  deadline = $state<number | null>(load(DEADLINE_KEY))
  conn = $state<ConnState>('disconnected')
  #ws: WsClient<ServerMsg, ClientMsg> | null = null
  #last: Watch | null = null
  #lastSent = 0

  get paired() {
    return !!this.pairing
  }
  get remaining() {
    return this.deadline ? Math.max(0, this.deadline - clock.now) : 0
  }
  get locked() {
    return this.remaining <= 0
  }

  start() {
    if (this.pairing) {
      startClientLog(this.pairing)
      playerCheck.maybeRun()
    }
    if (!this.pairing || this.#ws) return
    const { token, family } = this.pairing
    this.#ws = new WsClient<ServerMsg, ClientMsg>({
      url: wsUrl(family),
      authMessage: () => ({ type: 'auth', token }),
      isAuthOk: (m) => m.type === 'auth:ok',
      isAuthFail: (m) => m.type === 'auth:fail',
      isPong: (m) => m.type === 'pong',
      ping: () => ({ type: 'ping' }),
      onState: (s) => (this.conn = s),
      onMessage: (m) => this.#onMessage(m),
    })
    this.#ws.connect()
  }

  #onMessage(m: ServerMsg) {
    if (m.type === 'auth:ok' && this.#last) this.#send(this.#last)
    else if (m.type === 'library' && m.child === this.pairing?.child.id) library.set(m.library)
    else if (m.type === 'auth:fail') this.unpair()
    else if (m.type === 'child') {
      const offset = m.now - Date.now()
      this.deadline = m.until && m.until > m.now ? m.until - offset : null
      store(DEADLINE_KEY, this.deadline)
      if (this.pairing && this.pairing.child.name !== m.name) {
        this.pairing = { ...this.pairing, child: { id: m.id, name: m.name } }
        store(DEVICE_KEY, this.pairing)
      }
    }
  }

  async pair(code: string): Promise<string | null> {
    const res = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name: deviceName() }),
    }).catch(() => null)
    if (!res) return "Couldn't reach YouLearn. Check the internet."
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return (data as { error?: string }).error ?? 'That didn’t work.'
    this.pairing = data as Pairing
    store(DEVICE_KEY, this.pairing)
    this.start()
    return null
  }

  unpair() {
    this.#ws?.disconnect()
    this.#ws = null
    this.pairing = null
    this.deadline = null
    store(DEVICE_KEY, null)
    store(DEADLINE_KEY, null)
  }

  // What's on screen, for the parent's "finish this episode". Sent on every
  // change of video or play state, and every 15s while playing.
  watching(w: Watch | null) {
    const changed = !w || !this.#last || w.video !== this.#last.video || w.playing !== this.#last.playing
    this.#last = w
    if (changed || Date.now() - this.#lastSent > 15_000) this.#send(w)
  }

  #send(w: Watch | null) {
    this.#lastSent = Date.now()
    this.#ws?.send(w ? { type: 'watching', ...w } : { type: 'idle' })
  }
}

function deviceName() {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  return 'Computer'
}

export const device = new Device()

// --- the parent's console ----------------------------------------------------

export interface Me {
  email: string
  canStart: boolean
  signups: 'open' | 'full' | 'closed'
  family: { id: string; owner: string; parents: string[]; isOwner: boolean } | null
}

export interface Agent {
  id: string
  name: string | null
  created_at: string
  last_used: string | null
}

class Family {
  // null: not checked yet; false: signed in but in no family (or removed).
  allowed = $state<boolean | null>(null)
  me = $state<Me | null>(null)
  error = $state('')
  conn = $state<ConnState>('disconnected')
  children = $state<ChildState[]>([])
  devices = $state<DeviceInfo[]>([])
  libraries = $state<Record<string, Library>>({})
  loaded = $state(false)
  offset = 0 // server clock minus ours
  code = $state<{ child: string; code: string; exp: number; shown: number } | null>(null)
  #ws: WsClient<ServerMsg, ClientMsg> | null = null

  addChild(name: string) {
    const n = name.trim()
    if (n) this.send({ type: 'child:add', name: n })
  }

  async start() {
    if (this.#ws || !login.token) return
    const me = await this.#api('GET', '/api/me')
    if (me) this.#connect(me)
  }

  async #api(method: string, path: string, body?: unknown): Promise<Me | null> {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${login.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null)
    if (!res) {
      this.error = "Couldn't reach YouLearn."
      return null
    }
    if (res.status === 401) {
      login.handleUnauthorized()
      return null
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      this.error = (data as { error?: string }).error ?? 'That didn’t work.'
      return null
    }
    this.error = ''
    this.me = data as Me
    this.allowed = !!this.me.family
    return this.me
  }

  async startFamily() {
    const me = await this.#api('POST', '/api/family')
    if (me) this.#connect(me)
  }
  addParent(email: string) {
    return this.#api('POST', '/api/parents', { email })
  }
  removeParent(email: string) {
    return this.#api('DELETE', '/api/parents', { email })
  }

  // A change to the library. The new library comes back over the socket;
  // the answer is just whether it worked.
  async edit(change: { child: string; op: string; id?: string; url?: string; ids?: string[] }): Promise<string | null> {
    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(change),
    }).catch(() => null)
    if (!res) return "Couldn't reach YouLearn."
    if (res.status === 401) {
      login.handleUnauthorized()
      return 'Sign in again.'
    }
    if (res.ok) return null
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That didn’t work.'
  }

  async agents(): Promise<Agent[]> {
    const res = await fetch('/api/agents', { headers: { Authorization: `Bearer ${login.token}` } }).catch(() => null)
    return res?.ok ? ((await res.json()) as Agent[]) : []
  }

  async disconnect(id: string) {
    await fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${login.token}` } }).catch(() => null)
  }

  #connect(me: Me) {
    if (!me.family || this.#ws) return
    const family = me.family.id
    this.#ws = new WsClient<ServerMsg, ClientMsg>({
      url: wsUrl(family),
      authMessage: () => ({ type: 'auth', token: login.token ?? '' }),
      isAuthOk: (m) => m.type === 'auth:ok',
      isAuthFail: (m) => m.type === 'auth:fail',
      isPong: (m) => m.type === 'pong',
      ping: () => ({ type: 'ping' }),
      onState: (s) => (this.conn = s),
      onMessage: (m) => {
        if (m.type === 'family') {
          this.offset = m.now - Date.now()
          this.children = m.children
          this.devices = m.devices
          this.loaded = true
          // A device just paired with the code on screen: it's used up.
          const code = this.code
          if (code && m.devices.some((d) => d.child === code.child && d.created - this.offset >= code.shown - 1000)) this.code = null
        } else if (m.type === 'library') {
          this.libraries = { ...this.libraries, [m.child]: m.library }
        } else if (m.type === 'code') {
          this.code = { child: m.child, code: m.code, exp: m.exp - this.offset, shown: Date.now() }
        } else if (m.type === 'auth:fail') {
          this.allowed = false
        }
      },
    })
    this.#ws.connect()
  }

  stop() {
    this.#ws?.disconnect()
    this.#ws = null
    this.allowed = null
    this.me = null
    this.loaded = false
  }

  send(msg: ClientMsg) {
    return this.#ws?.send(msg) ?? false
  }

  // On our own clock.
  until(c: ChildState) {
    return c.until ? c.until - this.offset : null
  }
  remaining(c: ChildState) {
    const u = this.until(c)
    return u ? Math.max(0, u - clock.now) : 0
  }
  // Milliseconds left in the episode she's watching, if any.
  episodeLeft(c: ChildState) {
    return c.watching ? episodeLeft(c.watching, clock.now + this.offset) * 1000 : 0
  }
}

export const family = new Family()

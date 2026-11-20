// pwa-kit: chat/lib/ws-client.ts v1
// WebSocket connection layer for chat / realtime apps: the state machine,
// auth handshake, heartbeat, backoff, and the three browser signals that make
// reconnection feel native on a phone. Lifted from Angel's client, where every
// piece of it was added after a real failure on a real phone.
//
// The message vocabulary is the app's. This class only needs to know which
// server message means "auth ok", "auth failed" and "pong", and how to build
// the auth and ping messages. Everything else goes to `onMessage`.
//
//   const ws = new WsClient<ServerMsg, ClientMsg>({
//     authMessage: () => ({ type: 'auth', token: auth.token }),
//     isAuthOk: (m) => m.type === 'auth:ok',
//     isAuthFail: (m) => m.type === 'auth:fail',
//     isPong: (m) => m.type === 'pong',
//     ping: (ts) => ({ type: 'ping', ts }),
//     onMessage: (m) => reducer(m),        // auth:ok is delivered here too (snapshots, replay)
//     onState: (s) => (connState = s),
//   })
//   ws.connect()
//
// What's baked in (see reference/chat.md):
//   - states disconnected -> connecting -> authenticating -> connected -> reconnecting
//   - heartbeat: ping every 10s, pong deadline 5s, so a silent drop surfaces in ~15s
//   - backoff 1s doubling to 30s, reset on successful auth
//   - `visibilitychange` to visible reconnects immediately (mobile throttles
//     background timers to 60s+; without this every app-switch-back shows a dead
//     connection for a minute)
//   - `offline` force-closes and shows reconnecting at once; `online` resets
//     backoff and reconnects now. Faster than any heartbeat.
//   - a 90s ceiling: still reconnecting after that -> `onStalled()` once, so the
//     UI can offer a reload. No state may be permanent.
//   - every transition logs `[ws] …`; pair with kit remote-log/ to see it from a phone
//
// The app layer (its reducer) owns: seq dedupe (`if (msg.seq <= state.seq) return`),
// optimistic messages with descending negative ids replaced in place on confirm,
// re-sending a pending message after auth:ok, and applying stream snapshots.
// Angel's reducer is excerpted in the README.

export type ConnState = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting'

export interface WsClientOptions<In, Out> {
  url?: string
  authMessage: () => Out
  isAuthOk: (msg: In) => boolean
  isAuthFail: (msg: In) => boolean
  isPong: (msg: In) => boolean
  ping: (ts: number) => Out
  onMessage: (msg: In) => void
  onState?: (state: ConnState) => void
  onStalled?: () => void
  log?: (line: string) => void
}

const PING_EVERY = 10_000
const PONG_DEADLINE = 5_000
const BACKOFF_START = 1_000
const BACKOFF_CAP = 30_000
const STALL_AFTER = 90_000

export class WsClient<In = unknown, Out = unknown> {
  private ws: WebSocket | null = null
  private state: ConnState = 'disconnected'
  private opts: WsClientOptions<In, Out>
  private reconnectDelay = BACKOFF_START
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private pongTimeout: ReturnType<typeof setTimeout> | null = null
  private stallTimer: ReturnType<typeof setTimeout> | null = null
  private wantConnected = false
  private listenersBound = false

  constructor(opts: WsClientOptions<In, Out>) {
    this.opts = opts
  }

  getState(): ConnState {
    return this.state
  }

  get connected(): boolean {
    return this.state === 'connected'
  }

  connect() {
    this.wantConnected = true
    this.bindBrowserSignals()
    this.doConnect()
  }

  disconnect() {
    this.wantConnected = false
    this.setState('disconnected')
    this.stopPing()
    this.clearReconnectTimer()
    this.clearStall()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  // True if the message went out; false if the socket isn't open. Callers
  // that must not lose a message keep it as "pending" and re-send after the
  // next auth:ok (Angel does this for the chat message being typed).
  send(msg: Out): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }

  // ---- internals ----------------------------------------------------------

  private log(line: string) {
    ;(this.opts.log ?? ((l: string) => console.log(l)))(`[ws] ${line}`)
  }

  private setState(next: ConnState) {
    if (this.state === next) return
    this.log(`${this.state} -> ${next}`)
    this.state = next
    this.opts.onState?.(next)
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearStall() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
  }

  private doConnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState('connecting')

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = this.opts.url ?? `${proto}//${location.host}/ws`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.setState('authenticating')
      this.send(this.opts.authMessage())
    }

    ws.onmessage = (event) => {
      let msg: In
      try {
        msg = JSON.parse(event.data as string) as In
      } catch {
        return
      }
      this.handleMessage(msg)
    }

    ws.onclose = () => {
      this.stopPing()
      if (this.ws !== ws) return // superseded by a newer socket
      if (this.state !== 'disconnected' && this.wantConnected) {
        this.setState('reconnecting')
        this.armStall()
        this.clearReconnectTimer()
        this.reconnectTimer = setTimeout(() => {
          if (this.state === 'reconnecting') this.doConnect()
        }, this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, BACKOFF_CAP)
      }
    }

    ws.onerror = () => {}
  }

  private handleMessage(msg: In) {
    if (this.opts.isPong(msg)) {
      if (this.pongTimeout) {
        clearTimeout(this.pongTimeout)
        this.pongTimeout = null
      }
      return
    }
    if (this.opts.isAuthOk(msg)) {
      this.setState('connected')
      this.reconnectDelay = BACKOFF_START
      this.clearStall()
      this.startPing()
      // Fall through: the app wants auth:ok too (stream snapshots, replays).
    } else if (this.opts.isAuthFail(msg)) {
      this.wantConnected = false
      this.setState('disconnected')
    }
    this.opts.onMessage(msg)
  }

  private startPing() {
    this.stopPing()
    // Tighter heartbeat: a silent drop surfaces in ~15s worst case instead of ~35s.
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send(this.opts.ping(Date.now()))
        if (!this.pongTimeout) {
          this.pongTimeout = setTimeout(() => {
            this.pongTimeout = null
            this.log('pong deadline missed, closing')
            this.ws?.close()
          }, PONG_DEADLINE)
        }
      }
    }, PING_EVERY)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
  }

  private armStall() {
    if (this.stallTimer) return
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null
      if (this.state === 'reconnecting') {
        this.log('still reconnecting after 90s')
        this.opts.onStalled?.()
      }
    }, STALL_AFTER)
  }

  // The browser knows the network died before any heartbeat can: reflect it instantly.
  private handleOffline = () => {
    if (this.state === 'connected' || this.state === 'connecting' || this.state === 'authenticating') {
      this.log('offline event')
      this.setState('reconnecting')
      this.armStall()
      this.stopPing()
      if (this.ws) {
        try { this.ws.close() } catch {}
        this.ws = null
      }
    }
  }

  private handleOnline = () => {
    if (this.wantConnected && this.state !== 'connected' && this.state !== 'connecting' && this.state !== 'authenticating') {
      this.log('online event, reconnecting now')
      this.clearReconnectTimer()
      this.reconnectDelay = BACKOFF_START
      this.doConnect()
    }
  }

  // Visibility-change reconnect: bypass throttled timers on mobile.
  private handleVisible = () => {
    if (document.visibilityState !== 'visible') return
    if (this.state === 'reconnecting') {
      this.log('visible while reconnecting, reconnecting now')
      this.clearReconnectTimer()
      this.doConnect()
    }
  }

  private bindBrowserSignals() {
    if (this.listenersBound || typeof window === 'undefined') return
    this.listenersBound = true
    window.addEventListener('offline', this.handleOffline)
    window.addEventListener('online', this.handleOnline)
    document.addEventListener('visibilitychange', this.handleVisible)
  }
}

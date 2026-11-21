// pwa-kit: remote-log/lib/remote-log.ts v1
// Remote console log forwarder. Patches console.log/warn/error and batches
// tagged lines to the server, so mobile problems can be debugged without a
// cable. This is how the reconnection bugs in the chat apps got fixed: every
// state machine logs `[stream] …`, `[reconnect] …`, `[visibility] …`, and
// the lines show up server-side within two seconds.
//
// Only lines starting with `[` are forwarded (your tagged logs, not the
// framework's noise). Fire-and-forget: log forwarding must never break the
// app. Server side: a POST sink that appends { level, msg, ts } rows to its
// own log.
//
//   import { initRemoteLog } from '$shared/lib/remote-log'
//   initRemoteLog({ url: '/api/client-log', headers: () => ({ Authorization: `Bearer ${auth.token}` }) })

const FLUSH_INTERVAL = 2000
const MAX_BUFFER = 50

interface LogRow { level: string; msg: string; ts: number }
interface RemoteLogOptions { url?: string; headers?: () => Record<string, string> }

let buffer: LogRow[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let opts: Required<Pick<RemoteLogOptions, 'url'>> & RemoteLogOptions | null = null

function flush() {
  if (!buffer.length || !opts) return
  const batch = buffer.splice(0, MAX_BUFFER)
  fetch(opts.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers?.() ?? {}) },
    body: JSON.stringify({ logs: batch }),
  }).catch(() => {})
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL)
}

function intercept(level: string, original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    original.apply(console, args)
    const msg = args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ')
    if (!msg.startsWith('[')) return
    buffer.push({ level, msg, ts: Date.now() })
    scheduleFlush()
  }
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v) } catch { return String(v) }
}

export function initRemoteLog({ url = '/api/client-log', headers }: RemoteLogOptions = {}) {
  opts = { url, headers }
  console.log = intercept('log', console.log)
  console.warn = intercept('warn', console.warn)
  console.error = intercept('error', console.error)
  addEventListener('pagehide', flush)
}

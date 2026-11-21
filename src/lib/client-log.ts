// A child's device sends its tagged console lines (`[player] …`, `[ws] …`,
// `[error] …`) to the server, which writes them to Workers Logs. That's how
// we read what happens on a phone we don't have, like the Samsung A3 whose
// player never started (Nov 2026). Only paired devices: the server checks the
// device token. Parents' phones send nothing.
import { initRemoteLog } from '$shared/lib/remote-log'
import { browserName } from './browser'

let started = false

export function startClientLog(pairing: { token: string; family: string }) {
  if (started) return
  started = true
  initRemoteLog({
    url: '/api/client-log',
    headers: () => ({ Authorization: `Bearer ${pairing.token}`, 'X-Family': pairing.family }),
  })
  addEventListener('error', (e) => console.error(`[error] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`))
  addEventListener('unhandledrejection', (e) => console.error(`[error] unhandled rejection: ${e.reason?.message ?? e.reason}`))
  console.log(`[app] v${__BUILD__} in ${browserName()}, ${innerWidth}x${innerHeight}, ${navigator.onLine ? 'online' : 'offline'}`)
}

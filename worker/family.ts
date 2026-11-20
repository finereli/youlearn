// One family: its children, their paired devices, and whether each child is
// unlocked. Every parent console and child device holds a hibernating
// WebSocket here, so a change reaches everyone at once and idle sockets cost
// nothing.
//
// The timer is a deadline on the server's clock (`until`). Devices count down
// to it themselves and lock at zero even if the connection is gone. No alarm
// is needed: nothing has to happen on the server when time runs out.
import { DurableObject } from 'cloudflare:workers'
import { directory, signedIn, type Env } from './auth'
import { episodeLeft, FINISH_SLACK_S, type ChildState, type ClientMsg, type DeviceInfo, type ServerMsg, type Watching } from './protocol'

interface Child {
  id: string
  name: string
  until: number | null
  watching: Watching | null
}
interface Device extends DeviceInfo {
  hash: string
}
interface State {
  children: Child[]
  devices: Device[]
}
interface Attachment {
  family: string
  role?: 'parent' | 'device'
  email?: string
  child?: string
  device?: string
}

const MAX_MINUTES = 24 * 60

export class Family extends DurableObject<Env> {
  #state: State | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Heartbeats answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'))
  }

  async #load(): Promise<State> {
    this.#state ??= (await this.ctx.storage.get<State>('state')) ?? { children: [], devices: [] }
    return this.#state
  }

  async #save() {
    await this.ctx.storage.put('state', this.#state)
  }

  // --- sockets ---------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const family = new URL(request.url).pathname.split('/')[2]
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ family } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: ClientMsg
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {
      return
    }
    const att = ws.deserializeAttachment() as Attachment
    if (msg.type === 'ping') return send(ws, { type: 'pong' })
    if (msg.type === 'auth') return this.#auth(ws, att, msg.token)
    if (att.role === 'parent') return this.#parentMsg(ws, att, msg)
    if (att.role === 'device') return this.#deviceMsg(att, msg)
  }

  async webSocketClose(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment
    try { ws.close() } catch {}
    if (att.role === 'device') {
      // Last device of this child gone: nothing is playing any more.
      const state = await this.#load()
      const child = state.children.find((c) => c.id === att.child)
      if (child && this.#online(child.id, ws) === 0 && child.watching) {
        child.watching = null
        await this.#save()
      }
      this.#toParents(ws)
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws)
  }

  async #auth(ws: WebSocket, att: Attachment, token: string) {
    const state = await this.#load()
    if (token.startsWith('d.')) {
      const [, id, secret] = token.split('.')
      const device = state.devices.find((d) => d.id === id)
      if (!device || !secret || device.hash !== (await sha256(secret))) {
        send(ws, { type: 'auth:fail', reason: 'revoked' })
        return ws.close(4001, 'revoked')
      }
      device.lastSeen = Date.now()
      await this.#save()
      ws.serializeAttachment({ ...att, role: 'device', child: device.child, device: device.id } satisfies Attachment)
      send(ws, { type: 'auth:ok', role: 'device' })
      this.#toChild(device.child)
      this.#toParents()
      return
    }
    const user = await signedIn(token, this.env)
    const fam = user ? await directory(this.env).familyOf(user.email) : null
    if (!user || fam?.id !== att.family) {
      send(ws, { type: 'auth:fail', reason: 'not a parent' })
      return ws.close(4001, 'not a parent')
    }
    ws.serializeAttachment({ ...att, role: 'parent', email: user.email.toLowerCase() } satisfies Attachment)
    send(ws, { type: 'auth:ok', role: 'parent' })
    send(ws, this.#familyMsg())
  }

  // --- the parent's remote ---------------------------------------------------

  async #parentMsg(ws: WebSocket, att: Attachment, msg: ClientMsg) {
    const state = await this.#load()
    const now = Date.now()

    if (msg.type === 'child:add') {
      const name = String(msg.name).trim().slice(0, 30)
      if (!name) return
      state.children.push({ id: randomId(8), name, until: null, watching: null })
      await this.#save()
      return this.#toParents()
    }
    if (msg.type === 'revoke') {
      const device = state.devices.find((d) => d.id === msg.device)
      if (!device) return
      state.devices = state.devices.filter((d) => d !== device)
      await this.#save()
      for (const s of this.#sockets()) {
        const a = s.deserializeAttachment() as Attachment
        if (a.device === device.id) {
          send(s, { type: 'auth:fail', reason: 'revoked' })
          s.close(4001, 'revoked')
        }
      }
      return this.#toParents()
    }

    if (!('child' in msg)) return
    const child = state.children.find((c) => c.id === msg.child)
    if (!child) return
    const left = child.until && child.until > now ? child.until : now

    switch (msg.type) {
      case 'add': {
        // Like Family Link's bonus: on top of whatever is left.
        const minutes = clamp(msg.minutes, 1, MAX_MINUTES)
        child.until = left + minutes * 60_000
        break
      }
      case 'wind': {
        // A gentle stop: only ever shortens. Her countdown shows from here.
        const minutes = clamp(msg.minutes, 1, 10)
        if (child.until && child.until > now) child.until = Math.min(child.until, now + minutes * 60_000)
        break
      }
      case 'finish': {
        // Enough time to reach the end of what she's watching, never less
        // than she already had.
        if (!child.watching) return
        const end = now + (episodeLeft(child.watching, now) + FINISH_SLACK_S) * 1000
        child.until = Math.max(left, end)
        break
      }
      case 'lock':
        child.until = null
        break
      case 'pair': {
        const { code, exp } = await this.env.CODES.get(this.env.CODES.idFromName('codes')).create(att.family, child.id)
        return send(ws, { type: 'code', child: child.id, code, exp })
      }
      default:
        return
    }
    await this.#save()
    this.#toChild(child.id)
    this.#toParents()
  }

  // --- devices ---------------------------------------------------------------

  async #deviceMsg(att: Attachment, msg: ClientMsg) {
    const state = await this.#load()
    const child = state.children.find((c) => c.id === att.child)
    if (!child) return
    if (msg.type === 'watching') {
      child.watching = {
        video: String(msg.video).slice(0, 20),
        t: Number(msg.t) || 0,
        duration: Number(msg.duration) || 0,
        playing: !!msg.playing,
        at: Date.now(),
      }
    } else if (msg.type === 'idle') {
      child.watching = null
    } else return
    const device = state.devices.find((d) => d.id === att.device)
    if (device) device.lastSeen = Date.now()
    await this.#save()
    this.#toParents()
  }

  // Called by the Worker once a pairing code checks out.
  async addDevice(family: string, childId: string, name: string): Promise<{ token: string; family: string; child: { id: string; name: string } } | null> {
    const state = await this.#load()
    const child = state.children.find((c) => c.id === childId)
    if (!child) return null
    const id = randomId(8)
    const secret = randomId(32)
    const now = Date.now()
    state.devices.push({ id, child: child.id, name, created: now, lastSeen: now, hash: await sha256(secret) })
    await this.#save()
    this.#toParents()
    return { token: `d.${id}.${secret}`, family, child: { id: child.id, name: child.name } }
  }

  // Called by the Worker when the owner removes a parent.
  async kick(email: string) {
    const e = email.trim().toLowerCase()
    for (const s of this.#sockets()) {
      const a = s.deserializeAttachment() as Attachment
      if (a.role === 'parent' && a.email === e) {
        send(s, { type: 'auth:fail', reason: 'not a parent' })
        s.close(4001, 'not a parent')
      }
    }
  }

  // --- broadcasting ----------------------------------------------------------

  #sockets(): WebSocket[] {
    return this.ctx.getWebSockets()
  }

  #online(childId: string, except?: WebSocket): number {
    return this.#sockets().filter((s) => {
      if (s === except) return false
      const a = s.deserializeAttachment() as Attachment
      return a.role === 'device' && a.child === childId
    }).length
  }

  #familyMsg(except?: WebSocket): ServerMsg {
    const state = this.#state!
    return {
      type: 'family',
      now: Date.now(),
      children: state.children.map((c): ChildState => ({ ...c, online: this.#online(c.id, except) })),
      devices: state.devices.map(({ hash: _, ...d }) => d),
    }
  }

  #toParents(except?: WebSocket) {
    if (!this.#state) return
    const msg = this.#familyMsg(except)
    for (const s of this.#sockets()) {
      if (s !== except && (s.deserializeAttachment() as Attachment).role === 'parent') send(s, msg)
    }
  }

  #toChild(childId: string) {
    const child = this.#state?.children.find((c) => c.id === childId)
    if (!child) return
    const msg: ServerMsg = { type: 'child', now: Date.now(), id: child.id, name: child.name, until: child.until }
    for (const s of this.#sockets()) {
      const a = s.deserializeAttachment() as Attachment
      if (a.role === 'device' && a.child === childId) send(s, msg)
    }
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {}
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)))
}

function randomId(bytes: number) {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return btoa(String.fromCharCode(...new Uint8Array(d)))
}

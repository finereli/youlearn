// The YouLearn Worker: static app plus the parent's remote control.
//
// Who is who:
//   - A parent signs in with Google through login.finereli.com, and only on
//     their own phone. PARENT_EMAILS (a secret) lists who may be a parent.
//     For now every parent belongs to one family, "finer"; a public release
//     makes a family per parent.
//   - A child's device never signs in to anything. The parent shows a
//     six-digit code that works once for ten minutes; the device trades it
//     for a long random device token (POST /api/pair). That token only ever
//     means "this device belongs to this child": watch, get locked, unlocked.
//
// The live part is one Durable Object per family (Family, in family.ts). The
// parent's console and every paired device hold a WebSocket to it; a tap on
// the parent's phone changes the state there and reaches the iPad at once.
import { FAMILY_ID, parentOf, type Env } from './auth'
export { Family } from './family'
export { Codes } from './codes'

export function familyStub(env: Env, id: string) {
  return env.FAMILY.get(env.FAMILY.idFromName(id))
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // The socket: /ws/<family>. Auth is the first message, handled inside the
    // Durable Object, so the token never sits in a URL.
    const ws = url.pathname.match(/^\/ws\/([\w-]+)$/)
    if (ws) {
      if (ws[1] !== FAMILY_ID) return new Response('Not found', { status: 404 })
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
      return familyStub(env, ws[1]).fetch(request)
    }

    // Which family a signed-in parent belongs to (and whether they're one).
    if (url.pathname === '/api/me' && request.method === 'GET') {
      const user = await parentOf(request.headers.get('Authorization')?.replace(/^Bearer /, ''), env)
      if (!user) return json({ error: 'Not a parent here' }, 401)
      return json({ family: FAMILY_ID, email: user.email, name: user.name })
    }

    // A device trades a pairing code for its device token.
    if (url.pathname === '/api/pair' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { code?: string; name?: string }
      const code = String(body.code ?? '').replace(/\D/g, '')
      if (code.length !== 6) return json({ error: 'The code has six digits.' }, 400)
      const claim = await env.CODES.get(env.CODES.idFromName('codes')).claim(code)
      if ('error' in claim) return json({ error: claim.error }, claim.status)
      const name = String(body.name ?? '').slice(0, 40) || 'Device'
      const device = await familyStub(env, claim.family).addDevice(claim.child, name)
      if (!device) return json({ error: 'That code is no longer valid.' }, 410)
      return json(device)
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

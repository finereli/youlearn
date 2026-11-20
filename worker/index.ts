// The YouLearn Worker: static app plus the parent's remote control.
//
// Who is who:
//   - A parent signs in with Google through login.finereli.com, and only on
//     their own phone. Each family has an owner and other parents
//     (directory.ts); the owner adds and removes parents by email.
//   - A child's device never signs in to anything. A parent shows a
//     six-digit code that works once for ten minutes; the device trades it
//     for a long random device token (POST /api/pair). That token only ever
//     means "this device belongs to this child": watch, get locked, unlocked.
//
// The live part is one Durable Object per family (Family, in family.ts). The
// parent's console and every paired device hold a WebSocket to it; a tap on
// the parent's phone changes the state there and reaches the iPad at once.
import { directory, familyStub, signedIn, type Env } from './auth'
import type { FamilyInfo } from './directory'
export { Family } from './family'
export { Codes } from './codes'
export { Directory } from './directory'

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
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
      if (!(await directory(env).exists(ws[1]))) return new Response('Not found', { status: 404 })
      return familyStub(env, ws[1]).fetch(request)
    }

    // The parent's side: who am I, which family, start one, manage parents.
    if (url.pathname === '/api/me' || url.pathname === '/api/family' || url.pathname === '/api/parents') {
      const user = await signedIn(request.headers.get('Authorization')?.replace(/^Bearer /, ''), env)
      if (!user) return json({ error: 'Sign in again' }, 401)
      const dir = directory(env)
      const me = (f: FamilyInfo | null) =>
        json({
          email: user.email,
          name: user.name,
          canStart: env.SIGNUPS === 'open',
          family: f && { id: f.id, owner: f.owner, parents: f.parents, isOwner: f.owner === user.email.toLowerCase() },
        })

      if (url.pathname === '/api/me' && request.method === 'GET') return me(await dir.familyOf(user.email))
      if (url.pathname === '/api/family' && request.method === 'POST') {
        const f = await dir.start(user.email)
        return 'error' in f ? json(f, 403) : me(f)
      }
      if (url.pathname === '/api/parents' && (request.method === 'POST' || request.method === 'DELETE')) {
        const { email } = (await request.json().catch(() => ({}))) as { email?: string }
        if (!email) return json({ error: 'Which email?' }, 400)
        const f = request.method === 'POST' ? await dir.addParent(user.email, email) : await dir.removeParent(user.email, email)
        if ('error' in f) return json(f, 400)
        // A removed parent loses their open console at once.
        if (request.method === 'DELETE') await familyStub(env, f.id).kick(email)
        return me(f)
      }
      return json({ error: 'Not found' }, 404)
    }

    // A device trades a pairing code for its device token.
    if (url.pathname === '/api/pair' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { code?: string; name?: string }
      const code = String(body.code ?? '').replace(/\D/g, '')
      if (code.length !== 6) return json({ error: 'The code has six digits.' }, 400)
      const claim = await env.CODES.get(env.CODES.idFromName('codes')).claim(code)
      if ('error' in claim) return json({ error: claim.error }, claim.status)
      const name = String(body.name ?? '').slice(0, 40) || 'Device'
      const device = await familyStub(env, claim.family).addDevice(claim.family, claim.child, name)
      if (!device) return json({ error: 'That code is no longer valid.' }, 410)
      return json(device)
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

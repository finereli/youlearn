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
import { mcpAuth, mcpEndpoint } from './mcp'
import { videoId } from './library'
import { checkVideos } from './videos'
export { Family } from './family'
export { Codes } from './codes'
export { Directory } from './directory'

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Agents: OAuth discovery and approval, then the MCP endpoint (mcp.ts).
    const oauth = await mcpAuth(env).route(request, env.DB, url)
    if (oauth) return oauth
    if (url.pathname === '/mcp') return mcpEndpoint(env)(request, env.DB)

    // The socket: /ws/<family>. Auth is the first message, handled inside the
    // Durable Object, so the token never sits in a URL.
    const ws = url.pathname.match(/^\/ws\/([\w-]+)$/)
    if (ws) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
      if (!(await directory(env).exists(ws[1]))) return new Response('Not found', { status: 404 })
      return familyStub(env, ws[1]).fetch(request)
    }

    // The parent's side: who am I, which family, start one, manage parents.
    if (['/api/me', '/api/family', '/api/parents', '/api/library'].includes(url.pathname) || url.pathname.startsWith('/api/agents')) {
      const user = await signedIn(request.headers.get('Authorization')?.replace(/^Bearer /, ''), env)
      if (!user) return json({ error: 'Sign in again' }, 401)
      const dir = directory(env)
      const signups = await dir.signups()
      const me = (f: FamilyInfo | null) =>
        json({
          email: user.email,
          name: user.name,
          canStart: signups === 'open',
          signups,
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

      // A child's library, from the console. The new library reaches every
      // console and device over the family socket.
      if (url.pathname === '/api/library' && request.method === 'POST') {
        const f = await dir.familyOf(user.email)
        if (!f) return json({ error: 'Not in a family' }, 403)
        const stub = familyStub(env, f.id)
        const b = (await request.json().catch(() => ({}))) as { child?: string; op?: string; id?: string; url?: string; ids?: string[] }
        const child = String(b.child ?? '')
        let r: { ok: true } | { error: string }
        if (b.op === 'add-show') r = await stub.addCatalogShow(child, String(b.id))
        else if (b.op === 'remove-show') r = await stub.removeShow(child, String(b.id))
        else if (b.op === 'order') r = await stub.orderShows(child, (b.ids ?? []).map(String))
        else if (b.op === 'remove-video') r = await stub.removeExtras(child, [String(b.id)])
        else if (b.op === 'add-video') {
          const id = videoId(String(b.url ?? ''))
          if (!id) return json({ error: "That isn't a YouTube video link." }, 400)
          const c = (await checkVideos(stub, [id]))[id]
          if (!c?.ok) return json({ error: `Can't add it: ${c?.reason ?? 'unknown'}.` }, 400)
          r = await stub.addExtras(child, [{ id, title: c.title, duration: 0 }])
        } else return json({ error: 'Unknown change' }, 400)
        return 'error' in r ? json(r, 400) : json({ ok: true })
      }

      // The agents this parent approved, and taking one back.
      if (url.pathname === '/api/agents' && request.method === 'GET')
        return json(await mcpAuth(env).listClients(env.DB, user.email.toLowerCase()))
      const agent = url.pathname.match(/^\/api\/agents\/([\w-]+)$/)
      if (agent && request.method === 'DELETE') {
        await mcpAuth(env).revoke(env.DB, agent[1], user.email.toLowerCase())
        return json({ ok: true })
      }
      return json({ error: 'Not found' }, 404)
    }

    // A child's device sends its tagged console lines here (shared/lib/
    // remote-log.ts), so a bug on a phone we don't have can be read in
    // Workers Logs (dashboard, or `wrangler tail`). Paired devices only.
    if (url.pathname === '/api/client-log' && request.method === 'POST') {
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
      const fam = request.headers.get('X-Family') ?? ''
      if (!token.startsWith('d.') || !/^[\w-]+$/.test(fam) || !(await directory(env).exists(fam))) return json({ error: 'Not a device' }, 401)
      const dev = await familyStub(env, fam).device(token)
      if (!dev) return json({ error: 'Not a device' }, 401)
      const body = (await request.json().catch(() => ({}))) as { logs?: { level?: string; msg?: string; ts?: number }[] }
      const ua = (request.headers.get('User-Agent') ?? '').slice(0, 300)
      for (const row of (body.logs ?? []).slice(0, 50)) {
        console.log(JSON.stringify({
          client: true, family: fam, device: dev.id, deviceName: dev.name, child: dev.child,
          level: String(row.level ?? 'log').slice(0, 8), ts: Number(row.ts) || Date.now(), msg: String(row.msg ?? '').slice(0, 2000), ua,
        }))
      }
      return new Response(null, { status: 204 })
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

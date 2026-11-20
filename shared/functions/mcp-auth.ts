// pwa-kit: mcp/functions/mcp-auth.ts v1
// OAuth 2.1 for MCP clients (Claude, ChatGPT, Claude Code...): discovery documents (RFC 9728, RFC 8414), dynamic client
// registration (RFC 7591), authorization code with PKCE (S256 only), rotating refresh tokens. The user approves an agent
// by signing in through login.finereli.com; `identify` turns that sign-in into the account the agent will act as.
//
//   const mcpAuth = makeMcpAuth({
//     appName: 'Accountant',
//     consent: 'read your balances, transactions and forecast. It cannot change anything.',
//     // single owner: only OWNER_EMAIL may approve; multi-account: return claims.sub for anyone.
//     identify: async (token, origin) => {
//       const claims = await verifyLoginToken(token, { audience: [origin] })
//       return claims?.email === OWNER_EMAIL ? 'owner' : null
//     },
//   })
//   // in /.well-known and /oauth routes:  return (await mcpAuth.route(request, db, new URL(request.url))) ?? next()
//
// Origin: the Accountant (single owner) and Yara Reads (multi-account), both after notime's worker/mcp-auth.ts.

const ACCESS_TTL = 24 * 3600
const REFRESH_TTL = 180 * 86400
const CODE_TTL = 600

export interface McpAuthConfig {
  /** Shown to the user on the consent page and in discovery. */
  appName: string
  /** What the agent will be able to do, finishing "<agent> wants to ...". */
  consent: string
  /** The account id for a sign-in, or null to refuse it. `token` is the login.finereli.com token; `origin` is this app's. */
  identify(token: string, origin: string): Promise<string | null>
  scope?: string
  loginOrigin?: string
}

const enc = new TextEncoder()
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const randomToken = (bytes = 32) => b64u(crypto.getRandomValues(new Uint8Array(bytes)))
const sha256 = async (s: string) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)))
const now = () => Math.floor(Date.now() / 1000)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...cors, 'Cache-Control': 'no-store', ...headers } })
export const preflight = () => new Response(null, { status: 204, headers: cors })
const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Where an agent may send the user back to: https, or a local address for agents on a desktop.
const allowedRedirect = (u: string) => {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  } catch {
    return false
  }
}

const withQuery = (base: string, q: Record<string, string | null | undefined>) => {
  const u = new URL(base)
  for (const [k, v] of Object.entries(q)) if (v != null) u.searchParams.set(k, v)
  return u.toString()
}

export function makeMcpAuth(cfg: McpAuthConfig) {
  const scope = cfg.scope ?? 'read'
  const login = cfg.loginOrigin ?? 'https://login.finereli.com'

  // seam: the consent page's look. Plain on purpose; restyle to the app.
  const page = (title: string, body: string, status = 200) =>
    new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="font:16px/1.5 -apple-system,system-ui,sans-serif;background:#f6f4f0;color:#222;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px">
<div style="max-width:24rem"><h1 style="font-size:1.3rem;font-weight:600">${esc(title)}</h1>${body}</div>`,
      { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    )
  const button = (href: string, label: string, primary = true) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:8px 8px 0 0;padding:11px 20px;border-radius:22px;text-decoration:none;${primary ? 'background:#222;color:#fff' : 'border:1px solid #ccc;color:#222'}">${esc(label)}</a>`

  const protectedResource = (origin: string) =>
    json({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: [scope], bearer_methods_supported: ['header'], resource_name: cfg.appName })

  const authorizationServer = (origin: string) =>
    json({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [scope],
    })

  async function register(request: Request, db: D1Database): Promise<Response> {
    const b = (await request.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null
    const uris = Array.isArray(b?.redirect_uris) ? b!.redirect_uris.map(String) : []
    if (!uris.length || !uris.every(allowedRedirect)) return oauthError('invalid_redirect_uri', 'Give one or more https (or localhost) redirect_uris')
    const id = 'mcp_' + randomToken(18)
    const name = typeof b?.client_name === 'string' ? b.client_name.slice(0, 80) : null
    await db.prepare('INSERT INTO mcp_clients (id, name, redirect_uris) VALUES (?1, ?2, ?3)').bind(id, name, JSON.stringify(uris)).run()
    return json(
      { client_id: id, client_id_issued_at: now(), client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
      201
    )
  }

  async function client(db: D1Database, id: string) {
    const row = await db.prepare('SELECT id, name, redirect_uris FROM mcp_clients WHERE id = ?1').bind(id).first<{ id: string; name: string | null; redirect_uris: string }>()
    return row ? { ...row, uris: JSON.parse(row.redirect_uris) as string[] } : null
  }

  // Step 1: the agent sends the user here. Check what it asks for, keep the request, ask the user to approve by signing in.
  async function authorize(url: URL, db: D1Database): Promise<Response> {
    const p = url.searchParams
    const c = await client(db, p.get('client_id') ?? '')
    const redirect = p.get('redirect_uri') ?? ''
    // Without a known client and one of its own redirect URIs there is nowhere safe to send an error, so say it here.
    if (!c) return page('Unknown app', `<p>This app has not registered with ${esc(cfg.appName)}.</p>`, 400)
    if (!c.uris.includes(redirect)) return page('Wrong address', '<p>The app asked to come back to an address it did not register.</p>', 400)
    const back = (q: Record<string, string>) => withQuery(redirect, { ...q, state: p.get('state') })
    if (p.get('response_type') !== 'code') return Response.redirect(back({ error: 'unsupported_response_type' }), 302)
    if (p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge'))
      return Response.redirect(back({ error: 'invalid_request', error_description: 'PKCE with S256 is required' }), 302)

    const id = randomToken(18)
    await db.batch([
      db.prepare(`DELETE FROM mcp_pending WHERE created_at < datetime('now', '-1 hour')`),
      db.prepare('INSERT INTO mcp_pending (id, client_id, redirect_uri, state, code_challenge) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, c.id, redirect, p.get('state'), p.get('code_challenge')),
    ])
    const ret = `${url.origin}/oauth/login?p=${encodeURIComponent(id)}`
    return page(
      `Give an agent access to ${cfg.appName}?`,
      `<p><strong>${c.name ? esc(c.name) : 'An app'}</strong> wants to ${esc(cfg.consent)}</p>
<p>To allow it, sign in with Google.</p>
${button(withQuery(`${login}/start`, { return: ret }), 'Sign in with Google to allow')}${button(back({ error: 'access_denied' }), 'Cancel', false)}`
    )
  }

  // Step 2: back from login.finereli.com. Trade its code for a login token, ask `identify` who that is, hand the agent a code.
  async function loginReturn(url: URL, db: D1Database): Promise<Response> {
    const p = await db
      .prepare('DELETE FROM mcp_pending WHERE id = ?1 RETURNING client_id, redirect_uri, state, code_challenge')
      .bind(url.searchParams.get('p') ?? '')
      .first<{ client_id: string; redirect_uri: string; state: string | null; code_challenge: string }>()
    if (!p) return page('That request expired', '<p>Start again from the app that asked.</p>', 400)
    const back = (q: Record<string, string>) => Response.redirect(withQuery(p.redirect_uri, { ...q, state: p.state }), 302)

    const code = url.searchParams.get('finereli_code')
    if (!code) return back({ error: 'access_denied', error_description: url.searchParams.get('finereli_error') ?? 'sign-in cancelled' })
    const res = await fetch(`${login}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null)
    const body = res?.ok ? ((await res.json()) as { token?: string }) : null
    const sub = body?.token ? await cfg.identify(body.token, url.origin) : null
    if (!sub) return back({ error: 'access_denied', error_description: 'Sign-in was not accepted.' })

    const authCode = randomToken(32)
    await db
      .prepare(`INSERT INTO mcp_tokens (hash, kind, client_id, sub, redirect_uri, code_challenge, expires_at) VALUES (?1, 'code', ?2, ?3, ?4, ?5, ?6)`)
      .bind(await sha256(authCode), p.client_id, sub, p.redirect_uri, p.code_challenge, now() + CODE_TTL)
      .run()
    return back({ code: authCode })
  }

  async function issue(db: D1Database, clientId: string, sub: string) {
    const access = 'acc_' + randomToken(32)
    const refresh = 'acr_' + randomToken(32)
    await db.batch([
      db.prepare('DELETE FROM mcp_tokens WHERE expires_at < ?1').bind(now()),
      db.prepare(`INSERT INTO mcp_tokens (hash, kind, client_id, sub, expires_at) VALUES (?1, 'access', ?2, ?3, ?4)`).bind(await sha256(access), clientId, sub, now() + ACCESS_TTL),
      db.prepare(`INSERT INTO mcp_tokens (hash, kind, client_id, sub, expires_at) VALUES (?1, 'refresh', ?2, ?3, ?4)`).bind(await sha256(refresh), clientId, sub, now() + REFRESH_TTL),
    ])
    return json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope })
  }

  // Step 3: the agent trades the code (or a refresh token) for tokens.
  async function token(request: Request, db: D1Database): Promise<Response> {
    const type = request.headers.get('Content-Type') ?? ''
    const raw = type.includes('application/json')
      ? ((await request.json().catch(() => ({}))) as Record<string, string>)
      : Object.fromEntries(new URLSearchParams(await request.text()))
    const clientId = raw.client_id ?? ''
    if (!(await client(db, clientId))) return oauthError('invalid_client', 'Unknown client', 401)

    if (raw.grant_type === 'authorization_code') {
      const row = await db
        .prepare(`DELETE FROM mcp_tokens WHERE hash = ?1 AND kind = 'code' RETURNING client_id, sub, redirect_uri, code_challenge, expires_at`)
        .bind(await sha256(raw.code ?? ''))
        .first<{ client_id: string; sub: string; redirect_uri: string; code_challenge: string; expires_at: number }>()
      if (!row || row.expires_at < now() || row.client_id !== clientId) return oauthError('invalid_grant', 'The code is unknown, used or expired')
      if (raw.redirect_uri && raw.redirect_uri !== row.redirect_uri) return oauthError('invalid_grant', 'redirect_uri does not match')
      if (!raw.code_verifier || (await sha256(raw.code_verifier)) !== row.code_challenge) return oauthError('invalid_grant', 'PKCE check failed')
      return issue(db, clientId, row.sub)
    }

    if (raw.grant_type === 'refresh_token') {
      // One use each: the old refresh token goes as the new pair is made.
      const row = await db
        .prepare(`DELETE FROM mcp_tokens WHERE hash = ?1 AND kind = 'refresh' RETURNING client_id, sub, expires_at`)
        .bind(await sha256(raw.refresh_token ?? ''))
        .first<{ client_id: string; sub: string; expires_at: number }>()
      if (!row || row.expires_at < now() || row.client_id !== clientId) return oauthError('invalid_grant', 'The refresh token is unknown, used or expired')
      return issue(db, clientId, row.sub)
    }

    return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token')
  }

  return {
    /** The discovery documents and /oauth endpoints; null for any other path (let the app handle it). */
    async route(request: Request, db: D1Database, url: URL): Promise<Response | null> {
      const path = url.pathname
      if (!path.startsWith('/.well-known/') && !path.startsWith('/oauth/')) return null
      if (request.method === 'OPTIONS') return preflight()
      if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') return protectedResource(url.origin)
      if (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/openid-configuration') return authorizationServer(url.origin)
      if (path === '/oauth/register' && request.method === 'POST') return register(request, db)
      if (path === '/oauth/authorize' && request.method === 'GET') return authorize(url, db)
      if (path === '/oauth/login' && request.method === 'GET') return loginReturn(url, db)
      if (path === '/oauth/token' && request.method === 'POST') return token(request, db)
      return null
    },

    /** Every MCP request: a live access token, resolved to the account that approved it, or null. */
    async bearerSub(request: Request, db: D1Database): Promise<string | null> {
      const t = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      if (!t) return null
      const hash = await sha256(t)
      const row = await db.prepare(`SELECT sub, expires_at FROM mcp_tokens WHERE hash = ?1 AND kind = 'access'`).bind(hash).first<{ sub: string; expires_at: number }>()
      if (!row || row.expires_at < now()) return null
      await db.prepare(`UPDATE mcp_tokens SET last_used = datetime('now') WHERE hash = ?1`).bind(hash).run()
      return row.sub
    },

    unauthorized: (origin: string) =>
      json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` }),

    /** For the settings screen: which agents this account has approved. */
    async listClients(db: D1Database, sub: string) {
      const { results } = await db
        .prepare(
          `SELECT c.id, c.name, c.created_at,
                  (SELECT MAX(last_used) FROM mcp_tokens t WHERE t.client_id = c.id AND t.sub = ?1) AS last_used
           FROM mcp_clients c
           WHERE EXISTS (SELECT 1 FROM mcp_tokens t WHERE t.client_id = c.id AND t.sub = ?1 AND t.kind = 'refresh' AND t.expires_at > ?2)
           ORDER BY c.created_at DESC`
        )
        .bind(sub, now())
        .all<{ id: string; name: string | null; created_at: string; last_used: string | null }>()
      return results
    },

    /** Take an agent's access back. */
    revoke: (db: D1Database, clientId: string, sub: string) =>
      db.prepare('DELETE FROM mcp_tokens WHERE client_id = ?1 AND sub = ?2').bind(clientId, sub).run(),
  }
}

export type McpAuth = ReturnType<typeof makeMcpAuth>

// pwa-kit: mcp/scripts/mcp-flow-test.mjs v1
// Walks the whole MCP OAuth flow against a running dev server, as an agent would, and lists the tools it ends up with.
// Needs scripts/dev-login.mjs running (the stand-in for login.finereli.com) and the app pointed at it.
//
//   node mcp-flow-test.mjs [base-url]          default http://localhost:8787     (exit code 1 if any check fails)
//
// Checks discovery, registration (and refusing a non-https redirect), the consent page, the sign-in return, PKCE, single-use codes,
// refresh rotation, the 401 challenge, then initialize and tools/list over /mcp. App-specific tool tests belong in the app.
import { createHash, randomBytes } from 'node:crypto'

const H = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '')
const b64u = (b) => Buffer.from(b).toString('base64url')
let failed = 0
const ok = (name, cond, extra = '') => {
  if (!cond) failed++
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra)
}
const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) })
const REDIRECT = 'https://agent.example/cb'

const prm = await (await fetch(`${H}/.well-known/oauth-protected-resource`)).json()
const asm = await (await fetch(`${H}/.well-known/oauth-authorization-server`)).json()
ok('discovery', prm.resource?.endsWith('/mcp') && asm.code_challenge_methods_supported?.[0] === 'S256' && asm.registration_endpoint?.endsWith('/oauth/register'))
const un = await fetch(`${H}/mcp`, { method: 'POST', body: '{}' })
ok('/mcp without a token: 401 naming the resource metadata', un.status === 401 && /resource_metadata=/.test(un.headers.get('www-authenticate') || ''))
ok('CORS preflight on /mcp', (await fetch(`${H}/mcp`, { method: 'OPTIONS' })).status === 204)

const reg = await (await fetch(`${H}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Flow Test', redirect_uris: [REDIRECT] }) })).json()
ok('register', reg.client_id?.startsWith('mcp_'))
ok('register refuses an http redirect', (await fetch(`${H}/oauth/register`, { method: 'POST', body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) })).status === 400)

const verifier = b64u(randomBytes(32))
const challenge = b64u(createHash('sha256').update(verifier).digest())
const q = (o = {}) => new URLSearchParams({ client_id: reg.client_id, redirect_uri: REDIRECT, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', ...o })
async function approve() {
  const page = await (await fetch(`${H}/oauth/authorize?${q()}`)).text()
  const pending = decodeURIComponent(page.match(/oauth%2Flogin%3Fp%3D([^&"]+)/)?.[1] ?? '').replace(/^.*p=/, '')
  return { page, pending, back: await fetch(`${H}/oauth/login?p=${encodeURIComponent(pending)}&finereli_code=fake`, { redirect: 'manual' }) }
}
const first = await approve()
ok('consent page names the agent and links to sign-in', first.page.includes('Flow Test') && first.page.includes('/start?return='))
ok('authorize refuses an unregistered redirect', (await fetch(`${H}/oauth/authorize?${q({ redirect_uri: 'https://other.example/cb' })}`)).status === 400)
const loc = new URL(first.back.headers.get('location') || 'http://none')
ok('sign-in return redirects to the agent with code and state', first.back.status === 302 && loc.origin === 'https://agent.example' && loc.searchParams.get('state') === 'xyz' && !!loc.searchParams.get('code'), String(loc))
ok('a pending request is single use', (await fetch(`${H}/oauth/login?p=${encodeURIComponent(first.pending)}&finereli_code=fake`, { redirect: 'manual' })).status === 400)
const wrong = await fetch(`${H}/oauth/token`, form({ grant_type: 'authorization_code', client_id: reg.client_id, code: loc.searchParams.get('code'), redirect_uri: REDIRECT, code_verifier: 'wrong' }))
ok('a wrong PKCE verifier is refused', wrong.status === 400)

const second = new URL((await approve()).back.headers.get('location'))
const tokenReq = (code) => form({ grant_type: 'authorization_code', client_id: reg.client_id, code, redirect_uri: REDIRECT, code_verifier: verifier })
const tok = await (await fetch(`${H}/oauth/token`, tokenReq(second.searchParams.get('code')))).json()
ok('token exchange', tok.access_token?.startsWith('acc_') && tok.refresh_token?.startsWith('acr_'), JSON.stringify(tok))
ok('a code is single use', (await fetch(`${H}/oauth/token`, tokenReq(second.searchParams.get('code')))).status === 400)
const rt = await (await fetch(`${H}/oauth/token`, form({ grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token }))).json()
ok('refresh issues a new pair', !!rt.access_token && rt.refresh_token !== tok.refresh_token)
ok('the old refresh token is dead', (await fetch(`${H}/oauth/token`, form({ grant_type: 'refresh_token', client_id: reg.client_id, refresh_token: tok.refresh_token }))).status === 400)

const call = async (method, params, id = 1) =>
  (await fetch(`${H}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${rt.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json()
const init = await call('initialize', { protocolVersion: '2025-06-18' })
ok('initialize', !!init.result?.serverInfo?.name && init.result.protocolVersion === '2025-06-18')
const list = await call('tools/list', {}, 2)
ok('tools/list', Array.isArray(list.result?.tools) && list.result.tools.length > 0)
console.log('tools:', (list.result?.tools ?? []).map((t) => t.name).join(', '))
console.log('access token for your own calls:', rt.access_token)
process.exit(failed ? 1 : 0)

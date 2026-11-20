// A stand-in for login.finereli.com in local tests: serves /jwks.json and
// mints ES256 tokens like the real service. Run the Worker with
// LOGIN_ISSUER=http://localhost:8790 (in .dev.vars) to trust it.
//   node test/fake-login.mjs            serves on :8790
//   GET /mint?email=...&aud=...         returns a saved-login object
import { createServer } from 'node:http'
import { webcrypto as crypto } from 'node:crypto'

const ISSUER = 'http://localhost:8790'
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'test', alg: 'ES256', use: 'sig' }
const b64u = (b) => Buffer.from(b).toString('base64url')

async function mint(email, aud) {
  const now = Math.floor(Date.now() / 1000)
  const user = { sub: 'sub-' + email, email, name: email.split('@')[0], picture: '' }
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: 'test', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ iss: ISSUER, aud, exp: now + 3600, email_verified: true, ...user }))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(`${head}.${body}`))
  return { token: `${head}.${body}.${b64u(sig)}`, expiresAt: Date.now() + 3600_000, refreshedAt: Date.now(), user }
}

createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER)
  res.setHeader('Content-Type', 'application/json')
  if (url.pathname === '/jwks.json') return res.end(JSON.stringify({ keys: [jwk] }))
  if (url.pathname === '/mint') return res.end(JSON.stringify(await mint(url.searchParams.get('email'), url.searchParams.get('aud'))))
  res.statusCode = 404
  res.end('{}')
}).listen(8790, () => console.log('fake login on :8790'))

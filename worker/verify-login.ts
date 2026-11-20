// pwa-kit: login/functions/verify-login.ts v1
// Server side of login.finereli.com: check a request's Bearer token in the
// app's Worker or Pages Function.
//
//   const user = await verifyLogin(request, {
//     audience: ['https://myapp.finereli.com', 'http://localhost:5173'],
//   })
//   if (!user) return new Response('Unauthorized', { status: 401 })
//   // user.sub is the Google account id: key the app's own data on it.
//
// The public keys come from login.finereli.com/jwks.json, cached per isolate
// for an hour and refetched when a token names a key we haven't seen (that is
// how a key rotation reaches apps). No secrets live in the app.

export interface LoginClaims {
  iss: string
  sub: string
  aud: string
  exp: number
  email: string
  email_verified: boolean
  name: string
  picture: string
}

export interface VerifyOptions {
  audience: string | string[]
  issuer?: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()
let keys: { list: JsonWebKey[]; at: number; issuer: string } | null = null

export async function verifyLogin(request: Request, opts: VerifyOptions): Promise<LoginClaims | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '')
  return token ? verifyLoginToken(token, opts) : null
}

export async function verifyLoginToken(token: string, { audience, issuer = 'https://login.finereli.com' }: VerifyOptions): Promise<LoginClaims | null> {
  try {
    const [head, body, sig] = token.split('.')
    if (!sig) return null
    const header = JSON.parse(dec.decode(unb64u(head))) as { alg: string; kid: string }
    if (header.alg !== 'ES256') return null
    const jwk = await findKey(issuer, header.kid)
    if (!jwk) return null
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(sig), enc.encode(`${head}.${body}`))
    if (!ok) return null
    const claims = JSON.parse(dec.decode(unb64u(body))) as LoginClaims
    const auds = Array.isArray(audience) ? audience : [audience]
    if (claims.iss !== issuer || !auds.includes(claims.aud) || claims.exp * 1000 < Date.now()) return null
    return claims
  } catch {
    return null
  }
}

async function findKey(issuer: string, kid: string): Promise<JsonWebKey | undefined> {
  const fresh = keys && keys.issuer === issuer && Date.now() - keys.at < 3600_000
  let k = fresh ? keys!.list.find((j) => (j as { kid?: string }).kid === kid) : undefined
  // Refetch at most once a minute for an unknown kid, so junk tokens can't
  // turn every request into a JWKS fetch.
  if (!k && (!fresh || Date.now() - keys!.at > 60_000)) {
    const res = await fetch(`${issuer}/jwks.json`)
    if (!res.ok) return undefined
    keys = { list: ((await res.json()) as { keys: JsonWebKey[] }).keys, at: Date.now(), issuer }
    k = keys.list.find((j) => (j as { kid?: string }).kid === kid)
  }
  return k
}

function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// pwa-kit: mcp/scripts/dev-login.mjs v1
// A stand-in for login.finereli.com so signed-in behaviour (and an MCP approval) can be tested against a local dev server
// without Google. It serves /jwks.json and /exchange (any code is accepted, as the made-up account) and prints a login token.
//
//   node dev-login.mjs [email] [sub] [audience]        env: PORT (default 8788)
//
// In the app's dev env (.dev.vars) point the login origin at it, e.g. LOGIN_ORIGIN=http://localhost:8788, and have the code that
// verifies tokens / calls /exchange read that variable (default https://login.finereli.com). `audience` must be the origin the
// dev server sees, default http://localhost:8787 (wrangler dev). The token is good for a day.
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'

const email = process.argv[2] || 'tester@example.com'
const sub = process.argv[3] || 'dev-' + email.split('@')[0]
const audience = process.argv[4] || 'http://localhost:8787'
const port = Number(process.env.PORT || 8788)
const issuer = `http://localhost:${port}`
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'dev', alg: 'ES256', use: 'sig' }
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
const head = b64({ alg: 'ES256', kid: 'dev', typ: 'JWT' })
const body = b64({ iss: issuer, sub, aud: audience, exp: Math.floor(Date.now() / 1000) + 86400, email, email_verified: true, name: email.split('@')[0], picture: '' })
const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
const token = `${head}.${body}.${sig}`
createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(req.url === '/exchange' ? { token } : { keys: [jwk] }))
}).listen(port, () => console.log(token))

// Sign-in for parents: a verified Google account from login.finereli.com.
// Which family (if any) that account belongs to is the Directory's business.
import { verifyLoginToken, type LoginClaims } from './verify-login'

export interface Env {
  ASSETS: Fetcher
  DB: D1Database // MCP agents and their tokens (migrations/)
  FAMILY: DurableObjectNamespace<import('./family').Family>
  CODES: DurableObjectNamespace<import('./codes').Codes>
  DIRECTORY: DurableObjectNamespace<import('./directory').Directory>
  SIGNUPS?: string // "open" lets anyone signed in start a family
  SEED_FAMILY?: string // secret: the first family, {"owner": email, "parents": [emails]}
  LOGIN_ISSUER?: string // a stand-in login service, for tests only
}

const AUDIENCE = ['https://youlearn.finereli.com', 'http://localhost:5173', 'http://localhost:8787']

export async function signedIn(token: string | null | undefined, env: Env): Promise<LoginClaims | null> {
  if (!token) return null
  const user = await verifyLoginToken(token, { audience: AUDIENCE, issuer: env.LOGIN_ISSUER || undefined })
  return user && user.email_verified ? user : null
}

export function directory(env: Env) {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'))
}

export function familyStub(env: Env, id: string) {
  return env.FAMILY.get(env.FAMILY.idFromName(id))
}

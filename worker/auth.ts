// Who may be a parent: a verified Google account from login.finereli.com whose
// email is in PARENT_EMAILS (a secret, so the list stays out of the repo).
import { verifyLoginToken, type LoginClaims } from './verify-login'

export interface Env {
  ASSETS: Fetcher
  FAMILY: DurableObjectNamespace<import('./family').Family>
  CODES: DurableObjectNamespace<import('./codes').Codes>
  PARENT_EMAILS: string
  LOGIN_ISSUER?: string // a stand-in login service, for tests only
}

// For now every parent belongs to this one family.
export const FAMILY_ID = 'finer'

const AUDIENCE = ['https://youlearn.finereli.com', 'http://localhost:5173', 'http://localhost:8787']

export async function parentOf(token: string | null | undefined, env: Env): Promise<LoginClaims | null> {
  if (!token) return null
  const user = await verifyLoginToken(token, { audience: AUDIENCE, issuer: env.LOGIN_ISSUER || undefined })
  if (!user || !user.email_verified) return null
  const allowed = (env.PARENT_EMAILS || '').toLowerCase().split(/[\s,]+/).filter(Boolean)
  return allowed.includes(user.email.toLowerCase()) ? user : null
}

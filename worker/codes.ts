// Pairing codes, in one small Durable Object for the whole app: a code has to
// be found without knowing whose it is. A code works once and lives ten
// minutes. Wrong guesses are counted across everyone; past 30 in ten minutes
// pairing pauses, so six digits can't be brute-forced in a code's lifetime.
import { DurableObject } from 'cloudflare:workers'

const LIFETIME = 10 * 60_000
const WINDOW = 10 * 60_000
const MAX_MISSES = 30

interface Entry {
  family: string
  child: string
  exp: number
}

type Claim = { family: string; child: string } | { error: string; status: number }

export class Codes extends DurableObject {
  async create(family: string, child: string): Promise<{ code: string; exp: number }> {
    await this.#sweep()
    let code = ''
    do code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
    while (await this.ctx.storage.get(`code:${code}`))
    const exp = Date.now() + LIFETIME
    await this.ctx.storage.put(`code:${code}`, { family, child, exp } satisfies Entry)
    return { code, exp }
  }

  async claim(code: string): Promise<Claim> {
    const misses = ((await this.ctx.storage.get<number[]>('misses')) ?? []).filter((t) => t > Date.now() - WINDOW)
    if (misses.length >= MAX_MISSES) return { error: 'Too many tries. Wait a few minutes and get a new code.', status: 429 }
    const entry = await this.ctx.storage.get<Entry>(`code:${code}`)
    if (!entry || entry.exp < Date.now()) {
      await this.ctx.storage.put('misses', [...misses, Date.now()])
      return { error: "That code didn't work. Check it, or get a new one.", status: 404 }
    }
    await this.ctx.storage.delete(`code:${code}`)
    return { family: entry.family, child: entry.child }
  }

  async #sweep() {
    const all = await this.ctx.storage.list<Entry>({ prefix: 'code:' })
    const dead = [...all].filter(([, e]) => e.exp < Date.now()).map(([k]) => k)
    if (dead.length) await this.ctx.storage.delete(dead)
  }
}

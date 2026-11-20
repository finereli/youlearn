// Who belongs to which family. One small Durable Object for the whole app,
// because a parent's family has to be found from their email alone.
//
// A family has one owner (who started it, and who adds and removes the other
// parents) and any number of parents; every parent can run the timer and pair
// devices. An email belongs to at most one family. Parents are added by
// email before they ever sign in, so we key on the verified Google email, not
// the account id.
//
// While SIGNUPS isn't "open", nobody can start a new family. The first family
// comes from the SEED_FAMILY secret ({"owner": email, "parents": [emails]}),
// read once when the directory is empty.
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './auth'

export interface FamilyInfo {
  id: string
  owner: string
  parents: string[] // includes the owner
  created: number
}

const norm = (e: string) => String(e).trim().toLowerCase()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PARENTS = 8

export class Directory extends DurableObject<Env> {
  async #seeded() {
    if (await this.ctx.storage.get('seeded')) return
    await this.ctx.storage.put('seeded', true)
    if (!this.env.SEED_FAMILY) return
    try {
      const seed = JSON.parse(this.env.SEED_FAMILY) as { owner: string; parents?: string[] }
      const f = await this.#create(seed.owner)
      if ('id' in f) for (const p of seed.parents ?? []) await this.#add(f.id, p)
    } catch {}
  }

  async familyOf(email: string): Promise<FamilyInfo | null> {
    await this.#seeded()
    const id = await this.ctx.storage.get<string>(`email:${norm(email)}`)
    return id ? ((await this.ctx.storage.get<FamilyInfo>(`family:${id}`)) ?? null) : null
  }

  async exists(id: string): Promise<boolean> {
    return !!(await this.ctx.storage.get(`family:${id}`))
  }

  async start(email: string): Promise<FamilyInfo | { error: string }> {
    await this.#seeded()
    if (this.env.SIGNUPS !== 'open') return { error: 'YouLearn is invite-only for now.' }
    return this.#create(email)
  }

  async addParent(byEmail: string, email: string): Promise<FamilyInfo | { error: string }> {
    const f = await this.familyOf(byEmail)
    if (!f || f.owner !== norm(byEmail)) return { error: 'Only the family owner can add parents.' }
    return this.#add(f.id, email)
  }

  async removeParent(byEmail: string, email: string): Promise<FamilyInfo | { error: string }> {
    const f = await this.familyOf(byEmail)
    const e = norm(email)
    if (!f || f.owner !== norm(byEmail)) return { error: 'Only the family owner can remove parents.' }
    if (e === f.owner) return { error: "The owner can't be removed." }
    if (!f.parents.includes(e)) return f
    f.parents = f.parents.filter((p) => p !== e)
    await this.ctx.storage.put(`family:${f.id}`, f)
    await this.ctx.storage.delete(`email:${e}`)
    return f
  }

  async #create(owner: string): Promise<FamilyInfo | { error: string }> {
    const e = norm(owner)
    if (!EMAIL.test(e)) return { error: 'Not an email address.' }
    if (await this.ctx.storage.get(`email:${e}`)) return { error: 'Already in a family.' }
    const id = randomId()
    const f: FamilyInfo = { id, owner: e, parents: [e], created: Date.now() }
    await this.ctx.storage.put({ [`family:${id}`]: f, [`email:${e}`]: id })
    return f
  }

  async #add(id: string, email: string): Promise<FamilyInfo | { error: string }> {
    const e = norm(email)
    if (!EMAIL.test(e)) return { error: 'Not an email address.' }
    const f = await this.ctx.storage.get<FamilyInfo>(`family:${id}`)
    if (!f) return { error: 'No such family.' }
    if (f.parents.includes(e)) return f
    const other = await this.ctx.storage.get<string>(`email:${e}`)
    if (other) return { error: `${e} is already a parent in another family.` }
    if (f.parents.length >= MAX_PARENTS) return { error: 'That’s as many parents as a family can have.' }
    f.parents.push(e)
    await this.ctx.storage.put({ [`family:${id}`]: f, [`email:${e}`]: id })
    return f
  }
}

function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(9))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_')
}

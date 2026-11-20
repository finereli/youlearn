// What a family can watch, shared by the Worker and the app.
//
// A family's library is an ordered list of shows plus "More videos", single
// videos that belong to no show. A show is either a reference to the catalog
// (the shows we built by hand from the official channels, catalog.json) or
// the family's own, made by a parent or their agent. A catalog reference is
// stored as its id and resolved on read, so fixes to the catalog reach every
// family; editing it turns it into the family's own copy.
import catalog from './catalog.json'

export interface Video {
  id: string
  title: string
  duration: number // seconds; 0 when nobody has told us yet (the player finds out)
}
export interface Season {
  id: string
  title: string
  videos: Video[]
}
export interface Show {
  id: string
  title: string
  channel?: string
  art: string
  seasons: Season[]
  catalog?: boolean
}
export interface Library {
  shows: Show[]
  extras: Video[]
}

// What the Durable Object stores: catalog ids or the family's own shows.
export interface StoredLibrary {
  shows: (string | Show)[]
  extras: Video[]
}

export const CATALOG: Show[] = (catalog as { shows: Show[] }).shows.map((s) => ({ ...s, catalog: true }))
export const EXTRAS_ID = 'extras'

// A family that never touched its library gets the whole catalog.
export const DEFAULT_LIBRARY: StoredLibrary = { shows: CATALOG.map((s) => s.id), extras: [] }

export function resolve(stored: StoredLibrary): Library {
  return {
    shows: stored.shows.map((s) => (typeof s === 'string' ? CATALOG.find((c) => c.id === s) : s)).filter((s): s is Show => !!s),
    extras: stored.extras,
  }
}

export function thumb(id: string, size: 'mq' | 'hq' | 'maxres' = 'mq') {
  // mqdefault is 16:9 with no letterbox bars; hq/maxres for the big poster.
  return `https://i.ytimg.com/vi/${id}/${size === 'maxres' ? 'maxresdefault' : size + 'default'}.jpg`
}

// A video id from anything a parent might paste: the id itself, a watch,
// share, shorts, embed or live link.
export function videoId(input: string): string | null {
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null
    const v = u.searchParams.get('v')
    if (v && /^[\w-]{11}$/.test(v)) return v
    const m = u.pathname.match(/^\/(?:shorts\/|embed\/|live\/|v\/)?([\w-]{11})(?:[/?]|$)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function slug(title: string) {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .slice(0, 40) || 'show'
  )
}

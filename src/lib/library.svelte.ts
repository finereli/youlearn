// The shows, their seasons and episodes, and per-episode progress. The
// library is the family's (worker/library.ts): it arrives over the family
// socket and is kept here for the next launch, offline included. Before the
// first one arrives, the catalog stands in. Progress lives in localStorage on
// each device.
import { CATALOG, EXTRAS_ID, thumb, type Library, type Season, type Show, type Video } from '../../worker/library'

export { thumb, type Season, type Show, type Video }

const LIB_KEY = 'yl:library'

interface Hit {
  video: Video
  show: Show
  season: Season
  index: number
}

function cached(): Library | null {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) || 'null')
  } catch {
    return null
  }
}

class LibraryStore {
  data = $state<Library>(cached() ?? { shows: CATALOG, extras: [] })

  // The shows on the home page, with "More videos" as one more show at the
  // end when there are any.
  shows = $derived.by((): Show[] => {
    const { shows, extras } = this.data
    if (!extras.length) return shows
    return [...shows, { id: EXTRAS_ID, title: 'More videos', art: thumb(extras[0].id, 'hq'), seasons: [{ id: 'all', title: 'All', videos: extras }] }]
  })

  index = $derived.by(() => {
    const byId = new Map<string, Hit>()
    for (const show of this.shows)
      for (const season of show.seasons)
        season.videos.forEach((video, index) => byId.has(video.id) || byId.set(video.id, { video, show, season, index }))
    return byId
  })

  set(lib: Library) {
    this.data = lib
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(lib))
    } catch {}
  }
}

export const library = new LibraryStore()

export function find(id: string): Hit | null {
  return library.index.get(id) ?? null
}

// A video in some other library: the console looking up what a child is
// watching in that child's own shows.
export function findIn(lib: Library | null | undefined, id: string): { video: Video; show: Show } | null {
  if (!lib) return null
  for (const show of lib.shows) for (const season of show.seasons) for (const video of season.videos) if (video.id === id) return { video, show }
  const video = lib.extras.find((v) => v.id === id)
  return video ? { video, show: { id: EXTRAS_ID, title: 'More videos', art: '', seasons: [] } } : null
}

export function findShow(id: string): Show | null {
  return library.shows.find((s) => s.id === id) ?? null
}

// The next episode in the same show: on through the season, then the first
// episode of the next season. Never into another show, and nothing after a
// single video.
export function nextAfter(id: string): Video | null {
  const hit = find(id)
  if (!hit || hit.show.id === EXTRAS_ID) return null
  const i = hit.show.seasons.indexOf(hit.season)
  return hit.season.videos[hit.index + 1] ?? hit.show.seasons[i + 1]?.videos[0] ?? null
}

// --- progress ---------------------------------------------------------------

const KEY = 'yl:progress'
const LAST = 'yl:last'

export interface Progress {
  t: number // seconds watched
  done?: boolean
  d?: number // the episode's length, as the player found it
}

function readAll(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

class ProgressStore {
  all = $state<Record<string, Progress>>(readAll())
  last = $state<string | null>(localStorage.getItem(LAST))

  get(id: string): Progress | undefined {
    return this.all[id]
  }

  // How far in, 0-100. Videos a parent added may not know their length
  // until the player has seen them.
  pct(id: string, duration: number): number {
    const p = this.all[id]
    if (!p) return 0
    return p.done ? 100 : (100 * p.t) / Math.max(1, duration || p.d || 0)
  }

  // Where to start: the saved spot, unless it's in the first 10s (start
  // over) or the episode was finished.
  startAt(id: string): number {
    const p = this.all[id]
    if (!p || p.done || p.t < 10) return 0
    return p.t
  }

  save(id: string, t: number, duration: number) {
    if (!isFinite(t) || t < 1) return
    // The last 30 seconds are credits: count it as watched.
    const done = duration > 0 && t >= duration - 30
    this.all[id] = done ? { t: 0, done: true } : { t, done: this.all[id]?.done, d: duration || undefined }
    this.last = id
    this.#persist()
  }

  finish(id: string) {
    this.all[id] = { t: 0, done: true }
    this.#persist()
  }

  #persist() {
    localStorage.setItem(KEY, JSON.stringify(this.all))
    if (this.last) localStorage.setItem(LAST, this.last)
  }
}

export const progress = new ProgressStore()

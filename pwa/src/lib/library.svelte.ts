// The episode list and per-episode progress. The list is baked into the
// bundle for now (scripts/build-library.py); the parent console will move it
// to the server. Progress lives in localStorage on each device.
import data from './library.json'

export interface Video {
  id: string
  title: string
  duration: number
}
export interface Collection {
  id: string
  title: string
  videos: Video[]
}

export const collections: Collection[] = data.collections

const byId = new Map<string, { video: Video; collection: Collection; index: number }>()
for (const c of collections) c.videos.forEach((video, index) => byId.set(video.id, { video, collection: c, index }))

export function find(id: string) {
  return byId.get(id) ?? null
}

export function nextAfter(id: string): Video | null {
  const hit = byId.get(id)
  if (!hit) return null
  const i = collections.indexOf(hit.collection)
  return hit.collection.videos[hit.index + 1] ?? collections[i + 1]?.videos[0] ?? null
}

export function thumb(id: string, size: 'mq' | 'hq' | 'maxres' = 'mq') {
  // mqdefault is 16:9 with no letterbox bars; hq/maxres for the big poster.
  return `https://i.ytimg.com/vi/${id}/${size === 'maxres' ? 'maxresdefault' : size + 'default'}.jpg`
}

// --- progress ---------------------------------------------------------------

const KEY = 'yl:progress'
const LAST = 'yl:last'

export interface Progress {
  t: number // seconds watched
  done?: boolean
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
    this.all[id] = done ? { t: 0, done: true } : { t, done: this.all[id]?.done }
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

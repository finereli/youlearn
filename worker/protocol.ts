// What travels over the family socket, shared by the Worker and the app.
import type { Library } from './library'
//
// Time is the server's: every state message carries `now` (server ms), and a
// client keeps the offset to its own clock, so a wrong clock on the iPad
// doesn't change how long she gets. A child is unlocked while now < until.

export interface Watching {
  video: string
  t: number // seconds into the episode when reported
  duration: number
  playing: boolean
  at: number // server ms when reported
}

export interface ChildState {
  id: string
  name: string
  until: number | null
  watching: Watching | null
  online: number // devices connected right now
}

export interface DeviceInfo {
  id: string
  child: string
  name: string
  created: number
  lastSeen: number
}

export type ClientMsg =
  | { type: 'auth'; token: string }
  | { type: 'ping' }
  // parent
  | { type: 'add'; child: string; minutes: number }
  | { type: 'wind'; child: string; minutes: number }
  | { type: 'finish'; child: string }
  | { type: 'lock'; child: string }
  | { type: 'pair'; child: string }
  | { type: 'revoke'; device: string }
  | { type: 'child:add'; name: string }
  | { type: 'child:rename'; child: string; name: string }
  | { type: 'child:remove'; child: string }
  // device
  | { type: 'watching'; video: string; t: number; duration: number; playing: boolean }
  | { type: 'idle' }

export type ServerMsg =
  | { type: 'auth:ok'; role: 'parent' | 'device' }
  | { type: 'auth:fail'; reason: string }
  | { type: 'pong' }
  | { type: 'family'; now: number; children: ChildState[]; devices: DeviceInfo[] }
  | { type: 'child'; now: number; id: string; name: string; until: number | null }
  | { type: 'code'; child: string; code: string; exp: number }
  | { type: 'error'; message: string }
  | { type: 'library'; child: string; library: Library } // on connect, and after every change

// Stop this far before an episode's end (the player's end guard), plus a
// little slack, when a parent lets her finish the episode.
export const FINISH_SLACK_S = 20

export function episodeLeft(w: Watching, now: number): number {
  const t = w.t + (w.playing ? (now - w.at) / 1000 : 0)
  return Math.max(0, w.duration - t)
}

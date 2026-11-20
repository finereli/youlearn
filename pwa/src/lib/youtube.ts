// Loads YouTube's IFrame Player API once and hands out players. We use the
// official embed because a web page can't restyle youtube.com the way the Mac
// app's WKWebView did; the embed is the only YouTube a PWA can host.

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  destroy(): void
}

// YT.PlayerState
export const State = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<void> | null = null

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load the YouTube player'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export async function createPlayer(
  el: HTMLElement,
  videoId: string,
  start: number,
  events: { onReady: () => void; onState: (s: number) => void; onError: (code: number) => void }
): Promise<YTPlayer> {
  await loadApi()
  return new window.YT!.Player(el, {
    host: 'https://www.youtube-nocookie.com',
    videoId,
    width: '100%',
    height: '100%',
    playerVars: {
      // YouTube's own controls off: no title link, no logo link, no share,
      // no "more videos" strip. Our controls sit on a shield above the frame.
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      iv_load_policy: 3,
      playsinline: 1,
      modestbranding: 1,
      start: Math.floor(start),
      origin: location.origin,
    },
    events: {
      onReady: () => events.onReady(),
      onStateChange: (e: { data: number }) => events.onState(e.data),
      onError: (e: { data: number }) => events.onError(e.data),
    },
  })
}

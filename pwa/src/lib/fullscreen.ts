// Element fullscreen with the WebKit prefix. iPadOS Safari has element
// fullscreen (prefixed since 12, unprefixed since 16.4), so the whole player,
// our controls included, goes fullscreen. iPhone Safari only fullscreens bare
// <video> elements, which a cross-origin YouTube frame doesn't give us; there
// the player view already fills the installed app's screen, so the button
// just isn't shown.

type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type Doc = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}
const doc = document as Doc

export function supported(el: HTMLElement): boolean {
  const e = el as El
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled) && !!(e.requestFullscreen || e.webkitRequestFullscreen)
}

export function active(): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

export async function enter(el: HTMLElement) {
  const e = el as El
  try {
    if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: 'hide' })
    else await e.webkitRequestFullscreen?.()
  } catch {}
  // Android Chrome can turn the screen sideways once we're fullscreen;
  // elsewhere this throws and we ignore it.
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
  } catch {}
}

export async function exit() {
  try {
    if (doc.exitFullscreen && doc.fullscreenElement) await doc.exitFullscreen()
    else await doc.webkitExitFullscreen?.()
  } catch {}
}

export function onChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn)
  document.addEventListener('webkitfullscreenchange', fn)
  return () => {
    document.removeEventListener('fullscreenchange', fn)
    document.removeEventListener('webkitfullscreenchange', fn)
  }
}

// A short name for this browser and system, like "Samsung Internet 14 on
// Android 8". Shown when something fails on a device we don't have, so the
// parent can tell us what it runs.
export function browserName(ua = navigator.userAgent): string {
  const v = (re: RegExp) => ua.match(re)?.[1]
  const sys = v(/Android ([\d.]+)/) ? `Android ${v(/Android ([\d.]+)/)}`
    : v(/OS (\d+)[_\d]* like Mac/) ? `iOS ${v(/OS (\d+)[_\d]* like Mac/)}`
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown system'
  const app = v(/SamsungBrowser\/([\d.]+)/) ? `Samsung Internet ${v(/SamsungBrowser\/(\d+)/)}`
    : v(/(?:EdgA?|Edg)\/(\d+)/) ? `Edge ${v(/(?:EdgA?|Edg)\/(\d+)/)}`
    : v(/Firefox\/(\d+)/) ? `Firefox ${v(/Firefox\/(\d+)/)}`
    : / wv\)/.test(ua) ? `an app's web view (Chrome ${v(/Chrome\/(\d+)/)})`
    : v(/(?:Chrome|CriOS)\/(\d+)/) ? `Chrome ${v(/(?:Chrome|CriOS)\/(\d+)/)}`
    : v(/Version\/(\d+).*Safari/) ? `Safari ${v(/Version\/(\d+).*Safari/)}`
    : 'an unknown browser'
  return `${app} on ${sys}`
}

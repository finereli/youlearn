// Pair an Android phone, give it time, open an episode: does it play? Run on
// a fresh wrangler dev + test/fake-login.mjs (it names the first child).
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright')
const BASE = 'http://localhost:8787'
const shots = process.argv[2] || '.'
const device = devices[process.env.DEVICE || 'Galaxy S8']
const btn = (page, name) => page.getByRole('button', { name, exact: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const pctx = await browser.newContext({ ...devices['iPhone 13'] })
const tok = await (await fetch(`http://localhost:8790/mint?email=parent@example.com&aud=${BASE}`)).json()
await pctx.addInitScript((s) => localStorage.setItem('yl:login', s), JSON.stringify(tok))
const P = await pctx.newPage()
await P.goto(BASE)
if (await P.getByPlaceholder('Name').waitFor({ timeout: 5000 }).then(() => true, () => false)) {
  await P.getByPlaceholder('Name').fill('Yara')
  await btn(P, 'Add').click()
  await P.locator('.time').waitFor()
}
await P.goto(`${BASE}/#/settings/children`)
await P.getByRole('button', { name: /^Add (a|another) device$/ }).click()
const code = (await P.locator('.code').innerText()).replace(/\D/g, '')

const kctx = await browser.newContext({ ...device })
// BLOCK=1: stop YouTube's player files inside the frame, like a content
// blocker would; the player must say so instead of spinning.
if (process.env.BLOCK) await kctx.route(/youtube-nocookie\.com\/(s\/player|embed)/, (r) => r.abort())
const K = await kctx.newPage()
K.on('pageerror', (e) => console.log('PAGEERROR', e.message))
K.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 160)))
await K.goto(BASE)
await K.getByLabel(/Setting up a child's device/).fill(code)
await btn(K, 'Done').click()
await P.goto(`${BASE}/#/`)
await P.getByRole('button', { name: /^\+?30 min$/ }).click()
await K.getByText('Time for a break').waitFor({ state: 'detached', timeout: 5000 })

// The device checks once that YouTube's player can start.
const banner = K.getByText("Videos can't play on this device yet")
if (process.env.BLOCK) {
  await banner.waitFor({ timeout: 25000 })
  console.log('✓ blocked player: the home page asks to allow it')
  await K.screenshot({ path: `${shots}/android-blocked.png` })
  const [popup] = await Promise.all([K.waitForEvent('popup'), K.getByRole('button', { name: 'Ask to allow' }).click()])
  console.log(`✓ Ask to allow opens ${popup.url()}`)
  await popup.close()
  // The parent approves: the filter lets the frame through, and Check again passes.
  await kctx.unrouteAll()
  await K.getByRole('button', { name: 'Check again' }).click()
  await banner.waitFor({ state: 'detached', timeout: 25000 })
  console.log('✓ after approval, Check again clears it')
  await kctx.route(/youtube-nocookie\.com\/(s\/player|embed)/, (r) => r.abort())
} else {
  await K.waitForFunction(() => localStorage.getItem('yl:player-ok') === '1', null, { timeout: 25000 })
  console.log(`✓ player check passed and is remembered; banner shown: ${await banner.isVisible()}`)
}
await K.locator('.show').first().click()
await K.locator('button.card').first().click()
for (let i = 0; i < Number(process.env.SECONDS || 10); i++) {
  await K.waitForTimeout(1000)
  const s = await K.evaluate(() => ({
    spinner: !!document.querySelector('.spinner'),
    iframe: document.querySelector('.frame iframe')?.src?.slice(0, 80) ?? null,
    play: !!document.querySelector('[aria-label="Play"],[aria-label="Pause"]'),
    error: document.querySelector('.endcard')?.innerText.replace(/\s+/g, ' ') ?? null,
  }))
  console.log(i + 1, JSON.stringify(s))
}
await K.screenshot({ path: `${shots}/android-player.png` })
await browser.close()

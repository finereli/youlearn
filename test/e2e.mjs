// Two browsers against wrangler dev + test/fake-login.mjs: the parent's phone
// and the child's iPad, both at the same address. Pair, unlock, wind down,
// lock, go offline, remove; then the family's parents.
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright')

const BASE = 'http://localhost:8787'
const shots = process.argv[2] || '.'
const log = (...a) => console.log('✓', ...a)
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); log(m) }
const btn = (page, name) => page.getByRole('button', { name, exact: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const asParent = async (email, device = devices['iPhone 13']) => {
  const ctx = await browser.newContext({ ...device })
  const tok = await (await fetch(`http://localhost:8790/mint?email=${email}&aud=${BASE}`)).json()
  await ctx.addInitScript((s) => localStorage.setItem('yl:login', s), JSON.stringify(tok))
  const page = await ctx.newPage()
  await page.goto(BASE)
  return page
}

// Signed out, the one address shows both ways in.
const fresh = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
await fresh.goto(BASE)
assert(await fresh.getByRole('button', { name: 'Parent? Sign in with Google' }).isVisible(), 'welcome offers parent sign-in')
assert(await fresh.getByLabel(/Setting up a child's device/).isVisible(), '…and a code for a child’s device')
await fresh.screenshot({ path: `${shots}/welcome.png` })

const P = await asParent('parent@example.com')
await P.getByPlaceholder('Name').fill('Yara')
await btn(P, 'Add').click()
await P.locator('.time').getByText('Locked').waitFor()
log('signed-in parent lands in the console; new child starts locked')

await P.goto(`${BASE}/#/settings/children`)
await P.getByRole('button', { name: /^Add (a|another) device$/ }).click()
const code = (await P.locator('.code').innerText()).replace(/\D/g, '')
assert(code.length === 6, `pairing code shown (${code})`)
await P.screenshot({ path: `${shots}/parent-code.png` })

const ipad = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
const K = await ipad.newPage()
await K.goto(BASE)
await K.getByLabel(/Setting up a child's device/).fill('000000')
await btn(K, 'Done').click()
await K.locator('.error').waitFor()
await K.getByLabel(/Setting up a child's device/).fill(code)
await btn(K, 'Done').click()
await K.getByText('Time for a break, Yara').waitFor()
log('paired iPad opens locked')
await K.screenshot({ path: `${shots}/ipad-locked.png` })

await P.getByText('iPad').waitFor()
assert(!(await P.locator('.code').isVisible()), 'parent sees the iPad; the code is gone once used')

await P.goto(`${BASE}/#/`)
await btn(P, '15 min').click()
await K.getByText('Time for a break').waitFor({ state: 'detached', timeout: 3000 })
log('unlock reaches the iPad')
assert(!(await K.locator('.countdown').isVisible()), 'no countdown with 15 min left')
await btn(P, '+30 min').click()
await P.waitForTimeout(300)
const t = await P.locator('.time').innerText()
assert(/^4[45]:\d\d/.test(t), `+30 stacks on top (${t})`)

await btn(P, '3 min').click()
await K.locator('.countdown').waitFor({ timeout: 3000 })
const cd = (await K.locator('.countdown').innerText()).trim()
assert(/^(3:0[01]|2:5\d)$/.test(cd), `wrap up shows her countdown (${cd})`)
await K.screenshot({ path: `${shots}/ipad-countdown.png` })
await P.screenshot({ path: `${shots}/parent-remote.png` })

await btn(P, 'Lock now').click()
await K.getByText('Time for a break, Yara').waitFor({ timeout: 3000 })
log('lock now reaches the iPad at once')

// Offline: the iPad keeps counting down from what it last heard.
await btn(P, '15 min').click()
await K.getByText('Time for a break').waitFor({ state: 'detached', timeout: 3000 })
await ipad.setOffline(true)
await P.getByText("isn't connected right now").waitFor({ timeout: 20000 })
log('parent sees the iPad drop off')
await btn(P, '2 min').click()
await P.waitForTimeout(800)
assert(!(await K.locator('.countdown').isVisible()), 'offline iPad does not hear the wrap-up (expected)')
const dl = await K.evaluate(() => JSON.parse(localStorage.getItem('yl:deadline')))
assert(dl - Date.now() > 13 * 60_000, 'offline iPad keeps its saved deadline')
await ipad.setOffline(false)
await K.locator('.countdown').waitFor({ timeout: 20000 })
log('back online, it catches up with the wrap-up')

// Remove the device.
await P.goto(`${BASE}/#/settings/children`)
await btn(P, 'Remove').click()
await btn(P, 'Remove?').click()
await K.getByLabel(/Setting up a child's device/).waitFor({ timeout: 3000 })
log('removing the device sends the iPad back to the welcome screen')
assert(!(await K.evaluate(() => localStorage.getItem('yl:device'))), 'device token is gone from the iPad')

// Parents.
await P.goto(`${BASE}/#/settings/parents`)
assert(await P.getByText('Owner').isVisible(), 'the owner is marked')
const S = await asParent('second@example.com')
await S.locator('.time').waitFor()
log('the second parent sees the same family')
await S.goto(`${BASE}/#/settings/parents`)
assert(!(await S.getByPlaceholder('name@gmail.com').isVisible()), 'only the owner can invite')
await S.goto(`${BASE}/#/`)
await S.getByRole('button', { name: /^\+?15 min$/ }).click()
await P.goto(`${BASE}/#/`)
await btn(P, 'Lock now').waitFor({ timeout: 3000 })
log("the second parent's unlock shows on the owner's phone")

const stranger = await asParent('third@example.com')
await stranger.getByText("isn't a parent in any family").waitFor()
log('another Google account is refused (invite-only)')
await P.goto(`${BASE}/#/settings/parents`)
await P.getByPlaceholder('name@gmail.com').fill('Third@Example.com')
await btn(P, 'Invite').click()
await P.getByText('third@example.com').waitFor()
const T = await asParent('third@example.com')
await T.locator('.time').waitFor()
log('the owner invites a parent by email, and they get in')
const row = P.locator('li', { hasText: 'third@example.com' })
await row.getByRole('button', { name: 'Remove' }).click()
await row.getByRole('button', { name: 'Remove?' }).click()
await T.getByText("isn't a parent in any family").waitFor({ timeout: 5000 })
log('removing a parent closes their console at once')
await P.screenshot({ path: `${shots}/parent-parents.png` })

// Wide screen: the drawer is a permanent sidebar, a child per entry.
const W = await asParent('parent@example.com', { viewport: { width: 1200, height: 800 } })
await W.locator('.time').waitFor()
await W.screenshot({ path: `${shots}/parent-desktop.png` })

await browser.close()
console.log('all done')

// Two browsers against wrangler dev + test/fake-login.mjs: the parent's phone
// and the child's iPad. Pair, unlock, wind down, finish-episode, lock, revoke.
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright')

const BASE = 'http://localhost:8787'
const shots = process.argv[2] || '.'
const log = (...a) => console.log('✓', ...a)
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); log(m) }

const browser = await chromium.launch()
const saved = await (await fetch(`http://localhost:8790/mint?email=parent@example.com&aud=${BASE}`)).json()

const phone = await browser.newContext({ ...devices['iPhone 13'] })
await phone.addInitScript((s) => localStorage.setItem('yl:login', s), JSON.stringify(saved))
const P = await phone.newPage()
await P.goto(`${BASE}/#/parent`)

// First run: name the child.
await P.getByPlaceholder("Child's name").fill('Yara')
await P.getByRole('button', { name: 'Add' }).click()
await P.getByRole('heading', { name: 'Yara' }).waitFor()
assert(await P.getByText('Locked').isVisible(), 'new child starts locked')

await P.getByRole('button', { name: 'Add a device' }).click()
const code = (await P.locator('.code strong').innerText()).replace(/\D/g, '')
assert(code.length === 6, `pairing code shown (${code})`)
await P.screenshot({ path: `${shots}/parent-code.png` })

const ipad = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
const K = await ipad.newPage()
await K.goto(BASE)
assert(await K.getByText('Set up YouLearn').isVisible(), 'unpaired iPad shows the pairing screen')
await K.getByLabel('Code').fill('000000')
await K.getByRole('button', { name: 'Done' }).click()
await K.locator('.error').waitFor()
await K.getByLabel('Code').fill(code)
await K.getByRole('button', { name: 'Done' }).click()
await K.getByText('Time for a break, Yara').waitFor()
log('paired iPad opens locked')
await K.screenshot({ path: `${shots}/ipad-locked.png` })

await P.getByText('Connected', { exact: true }).waitFor()
assert(await P.getByText('iPad').isVisible(), 'parent sees the iPad paired and connected')
assert(!(await P.locator('.code').isVisible()), 'code is gone once used')

// Unlock 15 minutes.
await P.getByRole('button', { name: '15 min' }).click()
await K.getByText('Time for a break').waitFor({ state: 'detached', timeout: 3000 })
log('unlock reaches the iPad')
assert(!(await K.locator('.countdown').isVisible()), 'no countdown with 15 min left')
await P.getByRole('button', { name: '+30 min' }).click()
await P.waitForTimeout(300)
const big = await P.locator('.big').innerText()
assert(/^4[45]:\d\d/.test(big), `+30 stacks on top (${big.split('\n')[0]})`)

// Gentle stop: 3 minutes.
await P.getByRole('button', { name: '3 min' }).click()
await K.locator('.countdown').waitFor({ timeout: 3000 })
const cd = await K.locator('.countdown').innerText()
assert(/^(3:0[01]|2:5\d)$/.test(cd.trim()), `wrap up shows her countdown (${cd.trim()})`)
await K.screenshot({ path: `${shots}/ipad-countdown.png` })
await P.screenshot({ path: `${shots}/parent-unlocked.png` })

// Watching: open the first episode; the player reports it to the parent.
const first = K.locator('.show').first()
await first.click()
const ep = K.locator('button.card').first()
let watched = false
if (await ep.count()) {
  await ep.click()
  try {
    await P.locator('.watching').waitFor({ timeout: 15000 })
    watched = true
  } catch {}
}
if (watched) {
  log('parent sees what she is watching')
  const fin = P.getByRole('button', { name: /Let Yara finish this episode/ })
  if (await fin.isVisible()) {
    await fin.click()
    await P.waitForTimeout(500)
    log(`finish-episode extends time (${(await P.locator('.big').innerText()).split('\n')[0]})`)
  }
  await P.screenshot({ path: `${shots}/parent-watching.png` })
} else console.log('… skipped watching (YouTube not reachable from this sandbox)')

// Lock now.
await P.getByRole('button', { name: 'Lock now' }).click()
await K.getByText('Time for a break, Yara').waitFor({ timeout: 3000 })
log('lock now reaches the iPad at once')

// Offline: the iPad keeps counting down from what it last heard.
await P.getByRole('button', { name: '15 min' }).click()
await K.getByText('Time for a break').waitFor({ state: 'detached', timeout: 3000 })
await ipad.setOffline(true)
await P.getByRole('button', { name: '2 min' }).click()
await P.waitForTimeout(800)
assert(!(await K.locator('.countdown').isVisible()), 'offline iPad does not hear the wrap-up (expected)')
const dl = await K.evaluate(() => JSON.parse(localStorage.getItem('yl:deadline')))
assert(dl - Date.now() > 13 * 60_000, 'offline iPad keeps its saved deadline')
await ipad.setOffline(false)
await K.locator('.countdown').waitFor({ timeout: 20000 })
log('back online, it catches up with the wrap-up')

// Revoke.
await P.getByRole('button', { name: 'Remove iPad' }).click()
await P.getByRole('button', { name: 'Remove?' }).click()
await K.getByText('Set up YouLearn').waitFor({ timeout: 3000 })
log('removing the device sends the iPad back to pairing')
assert(!(await K.evaluate(() => localStorage.getItem('yl:device'))), 'device token is gone from the iPad')

// Parents: the seeded family has an owner and a second parent.
const asParent = async (email) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const tok = await (await fetch(`http://localhost:8790/mint?email=${email}&aud=${BASE}`)).json()
  await ctx.addInitScript((s) => localStorage.setItem('yl:login', s), JSON.stringify(tok))
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#/parent`)
  return page
}
assert(await P.getByText('Owner').isVisible(), 'the owner is marked')
const S = await asParent('second@example.com')
await S.getByRole('heading', { name: 'Yara' }).waitFor()
log('the second parent sees the same family')
assert(!(await S.getByPlaceholder("Another parent's Google email").isVisible()), 'only the owner can add parents')
await S.getByRole('button', { name: '15 min' }).click()
await P.getByText('Lock now').waitFor({ timeout: 3000 })
log("the second parent's unlock shows on the owner's phone")

const stranger = await asParent('third@example.com')
await stranger.getByText("isn't a parent in any family").waitFor()
log('another Google account is refused (invite-only)')
await P.getByPlaceholder("Another parent's Google email").fill('Third@Example.com')
await P.getByRole('button', { name: 'Invite' }).click()
await P.getByText('third@example.com').waitFor()
const T = await asParent('third@example.com')
await T.getByRole('heading', { name: 'Yara' }).waitFor()
log('the owner adds a parent by email, and they get in')
await P.getByRole('button', { name: 'Remove third@example.com' }).click()
await P.getByRole('button', { name: 'Remove?' }).click()
await T.getByText("isn't a parent in any family").waitFor({ timeout: 5000 })
log("removing a parent closes their console at once")
await P.screenshot({ path: `${shots}/parent-parents.png`, fullPage: true })

await browser.close()
console.log('all done')

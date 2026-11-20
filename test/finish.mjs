// Socket-level check of the timer rules, with a fake device reporting what
// it plays: finish-this-episode, wind-down only shortens, lock.
const BASE = 'http://localhost:8787'
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); console.log('✓', m) }
const { token } = await (await fetch(`http://localhost:8790/mint?email=parent@example.com&aud=${BASE}`)).json()

function open(tok) {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/finer`)
  const queue = []
  let waiter = null
  let last = null
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'family') last = m; if (waiter?.(m)) waiter = null; else queue.push(m) }
  const next = (type) => new Promise((res) => {
    const i = queue.findIndex((m) => m.type === type)
    if (i >= 0) return res(queue.splice(i, 1)[0])
    waiter = (m) => (m.type === type ? (res(m), true) : (queue.push(m), false))
  })
  return new Promise((res) => (ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', token: tok })); res({ ws, next, send: (m) => ws.send(JSON.stringify(m)), clear: () => (queue.length = 0), peek: (t) => queue.some((m) => m.type === t), get last() { return last } }) }))
}

const P = await open(token)
let fam = await P.next('family')
if (!fam.children.length) { P.send({ type: 'child:add', name: 'Yara' }); fam = await P.next('family') }
const child = fam.children[0].id
P.send({ type: 'pair', child })
const { code } = await P.next('code')
const pairing = await (await fetch(`${BASE}/api/pair`, { method: 'POST', body: JSON.stringify({ code, name: 'iPad' }) })).json()
assert(pairing.token?.startsWith('d.'), 'device token from code')
const again = await fetch(`${BASE}/api/pair`, { method: 'POST', body: JSON.stringify({ code, name: 'iPad' }) })
assert(again.status === 404, 'a code works only once')

const D = await open(pairing.token)
await D.next('auth:ok')
await new Promise((r) => setTimeout(r, 400))
P.clear()
// Let broadcasts land, then take the newest family state.
const state = async () => {
  await P.next('family')
  await new Promise((r) => setTimeout(r, 300))
  let f
  while (P.peek('family')) f = await P.next('family')
  return (f ?? P.last).children.find((c) => c.id === child)
}

P.send({ type: 'lock', child })
await state()
P.send({ type: 'add', child, minutes: 10 })
let c = await state()
assert(Math.abs(c.until - Date.now() - 600_000) < 2000, 'unlocked for 10 min')

D.send({ type: 'watching', video: 'abcdefghijk', t: 100, duration: 1500, playing: true })
c = await state()
assert(c.watching?.video === 'abcdefghijk', 'parent sees the episode')

P.send({ type: 'finish', child })
c = await state()
const want = Date.now() + (1400 + 20) * 1000
assert(Math.abs(c.until - want) < 3000, `finish gives time to the episode end + 20s (${Math.round((c.until - Date.now()) / 60000)} min)`)

P.send({ type: 'wind', child, minutes: 3 })
c = await state()
assert(Math.abs(c.until - Date.now() - 180_000) < 2000, 'wrap up in 3 min')
P.send({ type: 'wind', child, minutes: 5 })
c = await state()
assert(c.until - Date.now() < 245_000, 'wrap up never lengthens time')

P.send({ type: 'lock', child })
while (true) { const m = await D.next('child'); if (m.until === null) break }
assert(true, 'device hears the lock')

D.ws.close()
await new Promise((r) => setTimeout(r, 500))
P.send({ type: 'add', child, minutes: 1 })
c = await state()
assert(c.online === 0 && c.watching === null, 'device gone: offline, nothing playing')
P.send({ type: 'lock', child })
P.ws.close()
console.log('all done')
process.exit(0)

// The library over MCP and the console API, against wrangler dev.
//   node test/library.mjs <base> <mcp access token> <parent login token>
// Get the first from test/mcp-flow-test.mjs (last line) and the second from
// test/dev-login.mjs (it prints it), both run against the same server.
// Checks the tools' answers and refusals, and that a parent's socket hears
// every change.
const [H, ACCESS, LOGIN] = process.argv.slice(2)
let failed = 0
const ok = (name, cond, extra = '') => {
  if (!cond) failed++
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra)
}
let n = 0
let CHILD
async function call(name, args = {}) {
  if (CHILD && !('child' in args) && name !== 'guide' && name !== 'list_children') args = { child: CHILD, ...args }
  const res = await fetch(`${H}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }),
  })
  const r = (await res.json()).result
  const text = r.content[0].text
  let data = text
  try { data = JSON.parse(text) } catch {}
  return { error: !!r.isError, data, text }
}

// A parent's console socket: collects library messages per child.
const libs = []
const ws = new WebSocket(H.replace('http', 'ws') + '/ws/' + (await (await fetch(`${H}/api/me`, { headers: { Authorization: `Bearer ${LOGIN}` } })).json()).family.id)
await new Promise((r) => ws.addEventListener('open', r))
let kids = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.type === 'library') libs.push(m)
  if (m.type === 'family') kids = m.children
})
ws.send(JSON.stringify({ type: 'auth', token: LOGIN }))
const settle = () => new Promise((r) => setTimeout(r, 400))
await settle()

let r0 = await call('list_library')
ok('with no children, tools say to add one', r0.error && /no children/.test(r0.text), r0.text)
ws.send(JSON.stringify({ type: 'child:add', name: 'Yara' }))
await settle()
ok('a new child gets the catalog as their library', libs.at(-1)?.child === kids[0]?.id && libs.at(-1).library.shows.length === 4)
r0 = await call('list_library')
ok('with one child, the child can be left out', !r0.error && r0.data.child === 'Yara', r0.text)
ws.send(JSON.stringify({ type: 'child:add', name: 'Noa' }))
await settle()
r0 = await call('list_library')
ok('with two, tools ask which child', r0.error && /Yara/.test(r0.text) && /Noa/.test(r0.text), r0.text)
r0 = await call('list_children')
ok('list_children', JSON.stringify(r0.data) === '["Yara","Noa"]', r0.text)
CHILD = 'yara'
const YARA = kids[0].id

let r = await call('guide')
ok('guide', /full episodes/i.test(r.text))
r = await call('list_library')
ok('a new family starts with the catalog', r.data.shows.map((s) => s.id).join() === 'wildkratts,octonauts,zoboomafoo,naturecat', r.text)

r = await call('save_show', { title: 'Test Show', seasons: [{ title: 'Season 1', videos: ['nE-hoTqf7X0', 'aaaaaaaaaaa', 'not a video'] }] })
ok('save_show refuses a missing video and junk, saving nothing', r.error && r.data.fix_these?.length === 2, r.text)

r = await call('save_show', {
  title: 'Test Show',
  art_video: 'RHhi8Lnb8Pc',
  seasons: [
    { title: 'Season 1', videos: [{ id: 'nE-hoTqf7X0', title: 'The Gecko Effect', duration: 1336 }, 'https://youtu.be/RHhi8Lnb8Pc'] },
    { title: 'Season 2', videos: ['https://www.youtube.com/watch?v=As9pWd03zsQ'] },
  ],
})
ok('save_show creates a show from ids and links', r.data.saved && r.data.show === 'test-show' && r.data.episodes === 3, r.text)
await settle()
ok('console socket hears the new show, for that child', libs.at(-1)?.child === YARA && libs.at(-1).library.shows.some((s) => s.id === 'test-show'))
let noa = await call('list_library', { child: 'Noa' })
ok("the other child's library is untouched", noa.data.shows.length === 4 && !noa.data.shows.some((s) => s.id === 'test-show'), noa.text)

r = await call('get_show', { id: 'test-show' })
const s1 = r.data.seasons?.[0]?.videos
ok('get_show: titles from the agent or from YouTube', s1?.[0].title === 'The Gecko Effect' && s1?.[1].title.length > 3 && s1[1].title !== 'RHhi8Lnb8Pc', r.text)

r = await call('save_show', { id: 'test-show', title: 'Test Show', seasons: [{ title: 'S1', videos: ['nE-hoTqf7X0', 'nE-hoTqf7X0'] }] })
ok('save_show refuses duplicates', r.error && /more than once/.test(r.text), r.text)

r = await call('save_show', { id: 'octonauts', title: 'Octonauts (short)', seasons: [{ title: 'Season 1', videos: ['nE-hoTqf7X0'] }] })
r = await call('list_library')
ok('editing a catalog show makes it the family\'s own', r.data.shows.find((s) => s.id === 'octonauts')?.from_catalog === false, r.text)

r = await call('remove_show', { id: 'zoboomafoo' })
ok('remove_show', !r.error && !r.data.shows.some((s) => s.id === 'zoboomafoo'))
r = await call('list_catalog')
ok('list_catalog shows it as not in the library', r.data.find((s) => s.id === 'zoboomafoo')?.in_library === false)
r = await call('add_catalog_show', { id: 'zoboomafoo' })
ok('add_catalog_show puts it back at the end', r.data.shows.at(-1)?.id === 'zoboomafoo', r.text)
r = await call('add_catalog_show', { id: 'zoboomafoo' })
ok('add_catalog_show refuses a show already there', r.error)

r = await call('order_shows', { ids: ['test-show', 'naturecat'] })
ok('order_shows', r.data.shows.slice(0, 2).map((s) => s.id).join() === 'test-show,naturecat', r.text)

r = await call('add_videos', { videos: ['https://www.youtube.com/watch?v=RHhi8Lnb8Pc'] })
ok('add_videos', !r.error && r.data.more_videos === 1, r.text)
r = await call('remove_videos', { ids: ['RHhi8Lnb8Pc'] })
ok('remove_videos', !r.error && r.data.more_videos.length === 0, r.text)

// The console's own API
const api = (body) => fetch(`${H}/api/library`, { method: 'POST', headers: { Authorization: `Bearer ${LOGIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ child: YARA, ...body }) })
let res = await api({ op: 'add-video', url: 'https://youtu.be/nE-hoTqf7X0?t=12' })
ok('console: add a video by link', res.ok, await res.clone().text())
res = await api({ op: 'add-video', url: 'https://example.com/x' })
ok('console: refuses a non-YouTube link', res.status === 400)
res = await api({ op: 'add-video', url: 'https://youtu.be/aaaaaaaaaaa' })
ok('console: refuses a missing video', res.status === 400 && /no such video/.test((await res.json()).error))
await settle()
ok('console socket hears it', libs.at(-1)?.library.extras.length === 1)
res = await fetch(`${H}/api/library`, { method: 'POST', headers: { Authorization: `Bearer ${LOGIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ child: 'nobody', op: 'remove-show', id: 'wildkratts' }) })
ok('console: refuses a child not in the family', res.status === 400)
ws.send(JSON.stringify({ type: 'child:remove', child: kids[1].id }))
await settle()
r0 = await call('list_children')
ok('removing a child', JSON.stringify(r0.data) === '["Yara"]', r0.text)
res = await fetch(`${H}/api/library`, { method: 'POST', body: '{}' })
ok('console API needs a parent', res.status === 401)

const agents = await (await fetch(`${H}/api/agents`, { headers: { Authorization: `Bearer ${LOGIN}` } })).json()
ok('agents list shows the connected agent', agents.length >= 1, JSON.stringify(agents))
await fetch(`${H}/api/agents/${agents[0].id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${LOGIN}` } })
res = await fetch(`${H}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${ACCESS}`, 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' })
ok('a disconnected agent gets 401', res.status === 401)

ws.close()
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)

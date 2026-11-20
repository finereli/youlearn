// The parent's agents (Claude, ChatGPT, Claude Code...) manage the family's
// library over MCP. A parent approves an agent by signing in; the agent then
// works in that parent's family, and stops working the moment the parent
// leaves it. The agent does the finding and judging (which shows, which
// uploads are real full episodes, what season each belongs to) with its own
// search; the server only refuses what can't work: unknown ids, videos that
// can't be played outside YouTube, ids that don't belong.
import { makeMcpAuth } from '../shared/functions/mcp-auth'
import { fail, makeMcpEndpoint, type McpTool } from '../shared/functions/mcp-server'
import { directory, familyStub, signedIn, type Env } from './auth'
import { CATALOG, EXTRAS_ID, slug, thumb, videoId, type Library, type Season, type Show, type Video } from './library'
import { checkVideos } from './videos'

export function mcpAuth(env: Env) {
  return makeMcpAuth({
    appName: 'YouLearn',
    consent: "see and change which shows and videos your child can watch in YouLearn. It can't see anything else.",
    scope: 'library',
    loginOrigin: env.LOGIN_ISSUER || undefined,
    // The agent acts as the parent who approved it, by email: that's how
    // families know their parents.
    identify: async (token) => {
      const user = await signedIn(token, env)
      if (!user) return null
      return (await directory(env).familyOf(user.email)) ? user.email.toLowerCase() : null
    },
  })
}

interface Ctx {
  env: Env
  email: string
}

const GUIDE = `YouLearn shows a child only the YouTube videos her parents chose, in our own player: no recommendations, no comments, no next-video pull. You are working for one of her parents. Everything you save appears on the child's devices within seconds.

What she sees
- The home page: one card per show, in library order, then "More videos" (single videos that belong to no show).
- A show: season tabs, then the episodes of that season in order. When an episode ends, the next one in the same show is offered; nothing else is.

The catalog
- list_catalog shows the shows we already built and checked by hand (only real full episodes, from official channels, in season order). Prefer add_catalog_show over building a show the catalog already has.

Building a show (save_show)
- Only real full episodes from the show's official channel(s) or its broadcaster (PBS KIDS, the studio, the distributor). No compilations, marathons, "best of", shorts, clips, songs, trailers or re-uploads by other channels. If the parent asks for something else, do what they ask.
- One video per episode. Channels upload the same episode several times; keep one.
- Seasons in order, episodes in broadcast order. The show's Wikipedia "List of ... episodes" page is the best source for both.
- Episode titles: the episode's own name ("The Gecko Effect"), without the show's name, "Full Episode", season numbers or emoji. Shows whose episodes are two stories may keep both names ("Big Cats / Little Cats").
- Give durations in seconds if you know them; otherwise leave them out.
- art_video picks the show's card picture from one of its videos' thumbnails. Choose one that shows the main characters.
- Every video is checked before saving: it must exist and be playable outside YouTube. If some fail, nothing is saved and you get the list; drop or replace them and call again. Checking is cached, so calling again is cheap.
- save_show replaces the whole show when the id exists (including a catalog show, which becomes the family's own copy). To change one episode, get_show, edit, save_show.

Single videos
- add_videos puts videos on "More videos". Use it for one-offs the parent asks for: a documentary, a science video, a song.

Be honest with the parent about what you couldn't find. Many shows have only clips or compilations on YouTube; say so rather than filling seasons with them.`

function show(s: Show) {
  return {
    id: s.id,
    title: s.title,
    from_catalog: !!s.catalog,
    art: s.art,
    seasons: s.seasons.map((x) => ({ title: x.title, videos: x.videos })),
  }
}

function summary(lib: Library) {
  return {
    shows: lib.shows.map((s) => ({
      id: s.id,
      title: s.title,
      from_catalog: !!s.catalog,
      seasons: s.seasons.map((x) => `${x.title}: ${x.videos.length}`),
      episodes: s.seasons.reduce((n, x) => n + x.videos.length, 0),
    })),
    more_videos: lib.extras,
  }
}

async function family(ctx: Ctx) {
  const f = await directory(ctx.env).familyOf(ctx.email)
  if (!f) throw new Error('This parent is no longer in a family.')
  return familyStub(ctx.env, f.id)
}

type VideoIn = string | { id?: string; url?: string; title?: string; duration?: number }

// Ids or links in, checked videos out, or every problem at once.
async function checked(stub: ReturnType<typeof familyStub>, inputs: VideoIn[]) {
  const wanted: { id: string; title?: string; duration?: number }[] = []
  const problems: string[] = []
  for (const v of inputs) {
    const raw = typeof v === 'string' ? v : (v.id ?? v.url ?? '')
    const id = videoId(String(raw))
    if (!id) problems.push(`"${raw}": not a YouTube video id or link`)
    else wanted.push({ id, title: typeof v === 'object' ? v.title : undefined, duration: typeof v === 'object' ? v.duration : undefined })
  }
  const results = await checkVideos(stub, wanted.map((w) => w.id))
  const videos: Video[] = []
  for (const w of wanted) {
    const r = results[w.id]
    if (!r?.ok) problems.push(`${w.id}: ${r?.reason ?? 'not checked'}`)
    else videos.push({ id: w.id, title: String(w.title || r.title).slice(0, 200), duration: Math.max(0, Math.round(Number(w.duration) || 0)) })
  }
  return { videos, problems }
}

const videoItem = {
  oneOf: [
    { type: 'string', description: 'A video id (11 characters) or YouTube link' },
    {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Video id or link' },
        title: { type: 'string', description: "The episode's own name. Defaults to the YouTube title." },
        duration: { type: 'number', description: 'Length in seconds, if known' },
      },
      required: ['id'],
    },
  ],
}

const tools: McpTool<Ctx>[] = [
  {
    name: 'guide',
    description: 'How YouLearn works and the rules for choosing videos. Read this first.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => GUIDE,
  },
  {
    name: 'list_library',
    description: 'The shows the child can watch, in home-page order, with season and episode counts, plus "More videos".',
    inputSchema: { type: 'object', properties: {} },
    run: async (_, ctx) => summary(await (await family(ctx)).getLibrary()),
  },
  {
    name: 'get_show',
    description: "One show in the library with every season and episode (ids, titles, durations). Use 'extras' for More videos.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async ({ id }, ctx) => {
      const lib = await (await family(ctx)).getLibrary()
      if (id === EXTRAS_ID) return { id: EXTRAS_ID, title: 'More videos', videos: lib.extras }
      const s = lib.shows.find((x) => x.id === id)
      return s ? show(s) : fail(`No show "${id}" in the library. list_library shows the ids.`)
    },
  },
  {
    name: 'list_catalog',
    description: 'Shows already built and checked by hand (only full episodes, in season order), and whether each is in the library.',
    inputSchema: { type: 'object', properties: {} },
    run: async (_, ctx) => {
      const lib = await (await family(ctx)).getLibrary()
      return CATALOG.map((s) => ({
        id: s.id,
        title: s.title,
        seasons: s.seasons.map((x) => `${x.title}: ${x.videos.length}`),
        in_library: lib.shows.some((x) => x.id === s.id),
      }))
    },
  },
  {
    name: 'add_catalog_show',
    description: 'Add a catalog show to the library, at the end of the home page.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async ({ id }, ctx) => {
      const r = await (await family(ctx)).addCatalogShow(String(id))
      return 'error' in r ? fail(r.error) : summary(r.library)
    },
  },
  {
    name: 'save_show',
    description:
      'Create a show, or replace a whole show with the same id. Every video is checked first; if any fail, nothing is saved and you get the list. Read the guide for what belongs in a show.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Existing show id to replace; leave out to create (made from the title)' },
        title: { type: 'string' },
        art_video: { type: 'string', description: "Video id whose thumbnail is the show's card picture. Defaults to the first episode." },
        seasons: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string', description: 'e.g. "Season 1"' }, videos: { type: 'array', items: videoItem } },
            required: ['title', 'videos'],
          },
        },
      },
      required: ['title', 'seasons'],
    },
    run: async (args, ctx) => {
      const title = String(args.title ?? '').trim().slice(0, 80)
      if (!title) return fail('Give the show a title.')
      const seasonsIn = Array.isArray(args.seasons) ? (args.seasons as { title?: string; videos?: VideoIn[] }[]) : []
      if (!seasonsIn.length || seasonsIn.some((s) => !Array.isArray(s.videos) || !s.videos.length)) return fail('Give at least one season, each with at least one video.')
      const stub = await family(ctx)
      const lib = await stub.getLibrary()
      const id = args.id ? String(args.id) : uniqueId(slug(title), lib)

      const all = await checked(stub, seasonsIn.flatMap((s) => s.videos!))
      if (all.problems.length) return fail({ saved: false, fix_these: all.problems })
      const byId = new Map(all.videos.map((v) => [v.id, v]))
      const seen = new Set<string>()
      const dupes: string[] = []
      const seasons: Season[] = seasonsIn.map((s, i) => ({
        id: `s${i + 1}`,
        title: String(s.title || `Season ${i + 1}`).slice(0, 60),
        videos: s.videos!.flatMap((v) => {
          const vid = videoId(String(typeof v === 'string' ? v : (v.id ?? v.url ?? '')))!
          if (seen.has(vid)) return dupes.push(vid), []
          seen.add(vid)
          return [byId.get(vid)!]
        }),
      }))
      if (dupes.length) return fail({ saved: false, fix_these: dupes.map((d) => `${d}: appears more than once`) })

      const art = args.art_video ? videoId(String(args.art_video)) : null
      if (args.art_video && (!art || !seen.has(art))) return fail('art_video must be one of the show\'s own videos.')
      const r = await stub.saveShow({ id, title, art: thumb(art ?? seasons[0].videos[0].id, 'hq'), seasons })
      return 'error' in r ? fail(r.error) : { saved: true, show: id, episodes: seen.size, library: summary(r.library).shows.map((s) => s.title) }
    },
  },
  {
    name: 'remove_show',
    description: 'Take a show out of the library. Catalog shows can be added back any time.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async ({ id }, ctx) => {
      const r = await (await family(ctx)).removeShow(String(id))
      return 'error' in r ? fail(r.error) : summary(r.library)
    },
  },
  {
    name: 'order_shows',
    description: 'Set the order of shows on the home page. Shows you leave out keep their place after the ones you list.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    run: async ({ ids }, ctx) => {
      const r = await (await family(ctx)).orderShows((Array.isArray(ids) ? ids : []).map(String))
      return 'error' in r ? fail(r.error) : summary(r.library)
    },
  },
  {
    name: 'add_videos',
    description: 'Add single videos to "More videos" (for one-offs that belong to no show). Each is checked first; nothing is added if any fail.',
    inputSchema: { type: 'object', properties: { videos: { type: 'array', items: videoItem } }, required: ['videos'] },
    run: async ({ videos }, ctx) => {
      const stub = await family(ctx)
      const r = await checked(stub, Array.isArray(videos) ? (videos as VideoIn[]) : [])
      if (r.problems.length) return fail({ added: false, fix_these: r.problems })
      if (!r.videos.length) return fail('Give at least one video.')
      const e = await stub.addExtras(r.videos)
      return 'error' in e ? fail(e.error) : { added: r.videos.map((v) => v.title), more_videos: e.library.extras.length }
    },
  },
  {
    name: 'remove_videos',
    description: 'Take videos off "More videos". To change a show, use get_show and save_show.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    run: async ({ ids }, ctx) => {
      const list = (Array.isArray(ids) ? ids : []).map((x) => videoId(String(x)) ?? String(x))
      const r = await (await family(ctx)).removeExtras(list)
      return 'error' in r ? fail(r.error) : { more_videos: r.library.extras }
    },
  },
]

function uniqueId(base: string, lib: Library) {
  const taken = new Set([...lib.shows.map((s) => s.id), ...CATALOG.map((s) => s.id), EXTRAS_ID])
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

export function mcpEndpoint(env: Env) {
  return makeMcpEndpoint<Ctx>({
    auth: mcpAuth(env),
    name: 'youlearn',
    instructions:
      "YouLearn: the shows and videos a parent's child can watch, without the rest of YouTube. Call guide first: it has the rules (full episodes from official channels, one per episode, seasons in order). Changes reach the child's devices at once.",
    tools,
    context: (email) => ({ env, email }),
  })
}

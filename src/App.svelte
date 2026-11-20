<script lang="ts">
  // Three screens: all shows, one show, the player. The route lives in the
  // hash so the back button and a home-screen relaunch both work:
  //   #/              shows
  //   #/show/<id>     a show's seasons and episodes
  //   #/watch/<id>    an episode, over its show's page
  import Shows from './components/Shows.svelte'
  import ShowPage from './components/ShowPage.svelte'
  import Player from './components/Player.svelte'
  import { find, findShow } from './lib/library.svelte'

  type Route = { view: 'shows' } | { view: 'show'; show: string } | { view: 'watch'; video: string; show: string }

  function parse(): Route {
    let m = location.hash.match(/^#\/watch\/([\w-]{11})$/)
    const hit = m && find(m[1])
    if (hit) return { view: 'watch', video: hit.video.id, show: hit.show.id }
    m = location.hash.match(/^#\/show\/([\w-]+)$/)
    if (m && findShow(m[1])) return { view: 'show', show: m[1] }
    return { view: 'shows' }
  }

  let route = $state<Route>(parse())
  window.addEventListener('hashchange', () => (route = parse()))

  const show = $derived(route.view === 'shows' ? null : findShow(route.show))

  // Going deeper pushes an entry marked as ours; going back pops it when we
  // pushed it, and otherwise (opened from a link or relaunch) replaces it
  // with the parent, so the history never grows.
  function go(hash: string) {
    history.pushState({ pushed: true }, '', hash)
    route = parse()
  }
  function up(parent: string) {
    if (history.state?.pushed) history.back()
    else {
      history.replaceState(null, '', parent)
      route = parse()
    }
  }
  function next(id: string) {
    // Episode to episode replaces the entry: back always means the show.
    history.replaceState(history.state, '', `#/watch/${id}`)
    route = parse()
  }
</script>

{#if show}
  <ShowPage {show} onback={() => up('#/')} onplay={(id) => go(`#/watch/${id}`)} />
{:else}
  <Shows onshow={(id) => go(`#/show/${id}`)} onplay={(id) => go(`#/watch/${id}`)} />
{/if}

{#if route.view === 'watch'}
  <Player videoId={route.video} onback={() => up(`#/show/${route.view === 'watch' ? route.show : ''}`)} onnext={next} />
{/if}

<script lang="ts">
  // Three screens for the child: all shows, one show, the player. The route
  // lives in the hash so the back button and a home-screen relaunch both work:
  //   #/              shows
  //   #/show/<id>     a show's seasons and episodes
  //   #/watch/<id>    an episode, over its show's page
  //
  // One address for everyone. A device paired to a child is that child's: the
  // shows, locked until a parent gives it time. Any other device shows the
  // welcome screen (a parent signs in, or a child's device takes a code), and
  // with a parent signed in, the parent's console (ParentApp, its own routes).
  import Shows from './components/Shows.svelte'
  import ShowPage from './components/ShowPage.svelte'
  import Player from './components/Player.svelte'
  import Welcome from './components/Welcome.svelte'
  import ParentApp from './components/ParentApp.svelte'
  import Locked from './components/Locked.svelte'
  import Countdown from './components/Countdown.svelte'
  import { find, findShow } from './lib/library.svelte'
  import { device } from './lib/remote.svelte'
  import { account } from './lib/account.svelte'

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

  const show = $derived(route.view === 'show' || route.view === 'watch' ? findShow(route.show) : null)

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

{#if !device.paired}
  {#if account.user}
    <ParentApp />
  {:else}
    <Welcome />
  {/if}
{:else}
  {#if show}
    <ShowPage {show} onback={() => up('#/')} onplay={(id) => go(`#/watch/${id}`)} />
  {:else}
    <Shows onshow={(id) => go(`#/show/${id}`)} onplay={(id) => go(`#/watch/${id}`)} />
  {/if}

  {#if route.view === 'watch'}
    <Player videoId={route.video} onback={() => up(`#/show/${route.view === 'watch' ? route.show : ''}`)} onnext={next} />
  {:else}
    <Countdown />
  {/if}

  {#if device.locked}
    <Locked />
  {/if}
{/if}

<script lang="ts">
  // Three screens for the child: all shows, one show, the player; and the
  // parent's console. The route lives in the hash so the back button and a
  // home-screen relaunch both work:
  //   #/              shows
  //   #/show/<id>     a show's seasons and episodes
  //   #/watch/<id>    an episode, over its show's page
  //   #/parent        the parent's remote (sign-in, timer, devices)
  //
  // A device that isn't paired to a child shows the pairing screen instead of
  // the shows, or the console when a parent is signed in on it. A paired
  // device is locked until a parent gives it time.
  import Shows from './components/Shows.svelte'
  import ShowPage from './components/ShowPage.svelte'
  import Player from './components/Player.svelte'
  import Pair from './components/Pair.svelte'
  import Parent from './components/Parent.svelte'
  import Locked from './components/Locked.svelte'
  import Countdown from './components/Countdown.svelte'
  import { find, findShow } from './lib/library.svelte'
  import { device } from './lib/remote.svelte'
  import { account } from './lib/account.svelte'

  type Route = { view: 'shows' } | { view: 'show'; show: string } | { view: 'watch'; video: string; show: string } | { view: 'parent' }

  function parse(): Route {
    if (location.hash === '#/parent') return { view: 'parent' }
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

{#if route.view === 'parent'}
  <Parent onback={() => up('#/')} />
{:else if !device.paired}
  {#if account.user}
    <Parent />
  {:else}
    <Pair />
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

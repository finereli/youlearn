<script lang="ts">
  // Two screens: the episode grid and the player. The route lives in the
  // hash (#/watch/<id>) so the back button and a home-screen relaunch work.
  import Home from './components/Home.svelte'
  import Player from './components/Player.svelte'
  import { find } from './lib/library.svelte'

  function parse(): string | null {
    const m = location.hash.match(/^#\/watch\/([\w-]{11})$/)
    return m && find(m[1]) ? m[1] : null
  }

  let watching = $state<string | null>(parse())
  window.addEventListener('hashchange', () => (watching = parse()))

  function play(id: string) {
    history.pushState({ fromHome: true }, '', `#/watch/${id}`)
    watching = id
  }

  function back() {
    // Came from the grid: pop back to it, so the history doesn't grow.
    if (history.state?.fromHome) history.back()
    else {
      history.replaceState(null, '', '#/')
      watching = null
    }
  }

  function next(id: string) {
    // Episode to episode replaces the entry: back always means the grid.
    history.replaceState(history.state, '', `#/watch/${id}`)
    watching = id
  }
</script>

<Home onplay={play} />
{#if watching}
  <Player videoId={watching} onback={back} onnext={next} />
{/if}

<script lang="ts">
  // Shown when YouTube's player can't start here: on her home page (from the
  // check) and in the player when an episode doesn't start. "Ask to allow"
  // opens the player's address in its own tab, where Family Link (or another
  // filter) shows its page for asking a parent. "Check again" after that.
  import { ALL_SET_VIDEO, playerCheck, PLAYER_HOST } from '../lib/check.svelte'

  let { banner = false, onagain }: { banner?: boolean; onagain?: () => void } = $props()

  async function again() {
    if (onagain) return onagain()
    await playerCheck.run()
  }
</script>

<div class="blocked" class:banner role="status">
  <h2>Videos can't play on this device yet</h2>
  <p>A filter like Family Link is blocking YouTube's player. Tap <b>Ask to allow</b> and ask a grown-up to approve it. {#if ALL_SET_VIDEO}Once it's allowed, that page says <b>All set</b>: then come back here.{:else}Once it's allowed, that page says "Something went wrong": that's fine, just come back here.{/if}</p>
  <div class="row">
    <button class="primary" onclick={() => playerCheck.ask()}>Ask to allow</button>
    <button class="pill" disabled={playerCheck.state === 'checking'} onclick={again}>
      {playerCheck.state === 'checking' ? 'Checking…' : 'Check again'}
    </button>
  </div>
  <p class="grownups">Grown-ups: allow <b>{PLAYER_HOST}</b> in the filter's site list.</p>
</div>

<style>
  /* Its own dark panel: in the player it sits over the episode's thumbnail. */
  .blocked {
    display: grid;
    gap: 12px;
    justify-items: center;
    max-width: min(30em, 92vw);
    padding: 20px 22px;
    border-radius: 20px;
    text-align: center;
    color: var(--text-primary);
    background: rgba(10, 36, 34, 0.94);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  .banner {
    position: absolute;
    z-index: 15;
    left: 50%;
    bottom: calc(var(--safe-bottom) + 16px);
    transform: translateX(-50%);
    width: min(92vw, 34em);
    max-width: none;
    padding: 18px 20px;
    border-radius: 20px;
    background: var(--bg-raised);
    color: var(--text-primary);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  h2 { font-size: 1.3rem; font-weight: 700; }
  p { line-height: 1.45; opacity: 0.9; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .primary { padding: 12px 24px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-weight: 700; }
  .pill { padding: 12px 24px; border-radius: 999px; background: rgba(255, 255, 255, 0.15); color: inherit; font-weight: 600; }
  .pill:disabled { opacity: 0.6; }
  .grownups { font-size: 0.8rem; opacity: 0.7; }
</style>

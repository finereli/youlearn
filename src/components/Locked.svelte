<script lang="ts">
  // Time's up: covers everything, takes every tap, and stays until a parent
  // gives more time. The app doesn't close: whatever she was watching is
  // paused underneath and waits for her.
  import Icon from './Icon.svelte'
  import { device } from '../lib/remote.svelte'

  const name = $derived(device.pairing?.child.name ?? '')
  const offline = $derived(device.conn !== 'connected')
</script>

<div class="locked" role="dialog" aria-label="Time's up">
  <div class="badge"><Icon name="lock" size={56} /></div>
  <h1>Time for a break{name ? `, ${name}` : ''}</h1>
  <p>Ask a grown-up if you can watch some more.</p>
  {#if offline}<p class="offline">Not connected to the internet</p>{/if}
</div>

<style>
  .locked {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 24px;
    text-align: center;
    background: var(--bg-surface);
  }
  .badge {
    display: grid;
    place-items: center;
    width: 112px;
    height: 112px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    margin-bottom: 10px;
  }
  h1 { font-size: 2rem; font-weight: 800; }
  p { font-size: 1.2rem; color: var(--text-secondary); }
  .offline { font-size: 0.85rem; opacity: 0.7; margin-top: 20px; }
</style>

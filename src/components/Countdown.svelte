<script lang="ts">
  // Her countdown for the last five minutes, whether time is running out by
  // itself or a parent asked her to wrap up. It never takes a tap. The last
  // minute gets bigger and warmer so the end isn't a surprise.
  import Icon from './Icon.svelte'
  import { COUNTDOWN_FROM, device, mmss } from '../lib/remote.svelte'

  const ms = $derived(device.remaining)
  const shown = $derived(device.paired && ms > 0 && ms <= COUNTDOWN_FROM)
</script>

{#if shown}
  <div class="countdown" class:last={ms <= 60_000} role="timer" aria-live="off">
    <Icon name="hourglass_bottom" size={ms <= 60_000 ? 26 : 20} />
    <span>{mmss(ms)}</span>
  </div>
{/if}

<style>
  .countdown {
    position: absolute;
    z-index: 20;
    top: calc(var(--safe-top) + 14px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(15, 46, 44, 0.85);
    color: var(--accent);
    font-weight: 800;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }
  .countdown.last {
    padding: 8px 20px;
    font-size: 1.6rem;
    background: #e8725c;
    color: #fff;
  }
</style>

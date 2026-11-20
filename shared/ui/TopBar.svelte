<!-- pwa-kit: shell/ui/TopBar.svelte v15 -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  // The one bar at the top of every screen. `leading` decides whether it opens
  // the menu or goes back; everything else stays put, which is what makes it
  // read as an app rather than a page. Colours come from the host app's
  // tokens, so the same bar is sage in one app and amber in its sibling.
  // `trailing` is an optional action on the far side (a snippet rendering
  // the icon, with `trailingLabel` + `ontrailing`), used sparingly - most
  // screens have none. Seams: the aria labels.
  let { leading = 'menu', title = '', onleading, menuLabel = 'Menu', backLabel = 'Back', trailing, trailingLabel = '', ontrailing }: {
    leading?: 'menu' | 'back'; title?: string; onleading?: () => void; menuLabel?: string; backLabel?: string
    trailing?: Snippet; trailingLabel?: string; ontrailing?: () => void
  } = $props()
</script>

<header class="topbar">
  <button class="lead" class:menu-btn={leading !== 'back'} onclick={onleading} aria-label={leading === 'back' ? backLabel : menuLabel}>
    {#if leading === 'back'}
      <svg class="chevron" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    {/if}
  </button>

  <h1>{title}</h1>

  {#if trailing}
    <button class="lead" onclick={ontrailing} aria-label={trailingLabel} title={trailingLabel}>
      {@render trailing()}
    </button>
  {:else}
    <!-- Balances the leading button so the title sits truly centred. -->
    <span class="trail"></span>
  {/if}
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: calc(var(--safe-top) + var(--topbar-h));
    padding: var(--safe-top) 8px 0;
    background: var(--accent-deep);
    color: #fff;
    flex: none;
    z-index: 20;
  }

  .lead,
  .trail {
    width: 44px;
    height: 44px;
    flex: none;
    display: grid;
    place-items: center;
  }

  .lead {
    border-radius: 50%;
    opacity: 0.9;
    transition: background 0.15s, opacity 0.15s;
  }
  .lead:hover { background: rgba(255, 255, 255, 0.12); opacity: 1; }
  @media (min-width: 768px) {
    .lead.menu-btn { visibility: hidden; }
  }
  /* The chevron points at the edge the user came from. The raw path is a ">",
     which is right for RTL; LTR flips it. */
  :global([dir='ltr']) .chevron { transform: scaleX(-1); }

  h1 {
    flex: 1;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

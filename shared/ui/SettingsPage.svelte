<!-- pwa-kit: settings/ui/SettingsPage.svelte v2 -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../css/settings.css'
  // The frame of every settings page, flat or multi-pane: a title and, on a
  // sub-page on desktop (where the top bar is gone or quiet), a link back up.
  // On mobile the top bar carries the title and the back arrow, so both hide.
  let { title, back, backLabel = 'Settings', children }: {
    title: string; back?: string; backLabel?: string; children: Snippet
  } = $props()
</script>

<div class="settings">
  {#if back}
    <a class="up" href={`#${back}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {backLabel}
    </a>
  {/if}
  <h2>{title}</h2>
  {@render children()}
</div>

<style>
  .up {
    display: none;
    align-items: center;
    gap: 2px;
    margin: 0 0 10px -4px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    text-decoration: none;
  }
  .up:hover { color: var(--text-primary); }
  @media (min-width: 768px) {
    .up { display: inline-flex; }
  }
  /* On mobile the top bar already carries the title. */
  @media (max-width: 767px) {
    h2 { display: none; }
  }
</style>

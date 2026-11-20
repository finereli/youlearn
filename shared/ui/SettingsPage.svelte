<!-- pwa-kit: settings/ui/SettingsPage.svelte v3 -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../css/settings.css'
  // The frame of every settings page, flat or multi-pane. The kit's TopBar
  // carries the page title and the back arrow at every width (on desktop too,
  // beside the sidebar), so by default this draws neither: a second title
  // under the bar reads as a stutter. `standalone` is for an app with no
  // titled top bar: then the page shows its own title, and on a sub-page on
  // desktop a link back up.
  let { title, back, backLabel = 'Settings', standalone = false, children }: {
    title: string; back?: string; backLabel?: string; standalone?: boolean; children: Snippet
  } = $props()
</script>

<div class="settings">
  {#if standalone && back}
    <a class="up" href={`#${back}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {backLabel}
    </a>
  {/if}
  {#if standalone}<h2>{title}</h2>{/if}
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
</style>

<!-- pwa-kit: settings/ui/SettingsRow.svelte v2 -->
<script lang="ts">
  // One row of a multi-pane settings index: title, a one-line summary of the
  // section's CURRENT STATE, chevron. The summary is what makes the index read
  // as finished - "Dark, teal", "2 connected, 1 needs attention", the model's
  // name - not a description of what is inside ("Model, voice, effort"). Fall
  // back to a description only while the state is loading.
  // Use inside <ul class="rows"> on a SettingsPage.
  let { href, title, sub = '' }: { href: string; title: string; sub?: string } = $props()
</script>

<li>
  <a {href}>
    <span class="row-text"><span class="row-title">{title}</span>{#if sub}<span class="row-sub">{sub}</span>{/if}</span>
    <svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
  </a>
</li>

<style>
  /* The chevron points forward: flip it in RTL. */
  :global([dir='rtl']) .chev { transform: scaleX(-1); }
</style>

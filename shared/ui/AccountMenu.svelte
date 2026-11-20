<!-- pwa-kit: shell/ui/AccountMenu.svelte v15 -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  // The account button at the start of the drawer footer: avatar (or an
  // initial) and the name, never the email - the footer is one balanced row,
  // and the email belongs on the Account settings page. A tap opens a small
  // menu upwards; outside tap or Escape closes it. The menu snippet gets a
  // close() to call before acting.
  //
  // Seams: the menu items (Sign out at least; Account, Switch user later).
  let { name, picture = null, tabindex = 0, menu }: {
    name: string; picture?: string | null; tabindex?: number; menu: Snippet<[() => void]>
  } = $props()

  let open = $state(false)
  let el = $state<HTMLElement>()
  const initial = $derived((name[0] || '?').toUpperCase())
  const close = () => (open = false)

  $effect(() => {
    if (!open) return
    const onEvent = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el?.contains(e.target as Node)) open = false
    }
    document.addEventListener('pointerdown', onEvent)
    document.addEventListener('keydown', onEvent)
    return () => {
      document.removeEventListener('pointerdown', onEvent)
      document.removeEventListener('keydown', onEvent)
    }
  })
</script>

<div class="wrap" bind:this={el}>
  <button class="who" onclick={() => (open = !open)} aria-haspopup="menu" aria-expanded={open} {tabindex}>
    {#if picture}
      <img class="avatar" src={picture} alt="" referrerpolicy="no-referrer" />
    {:else}
      <span class="avatar initial" aria-hidden="true">{initial}</span>
    {/if}
    <span class="name">{name}</span>
  </button>
  {#if open}
    <div class="menu" role="menu">{@render menu(close)}</div>
  {/if}
</div>

<style>
  .wrap { position: relative; flex: 1; min-width: 0; }
  .who {
    display: flex; align-items: center; gap: 10px;
    max-width: 100%; padding: 4px 8px 4px 4px; margin-inline-start: -4px;
    border-radius: var(--radius); color: var(--text-primary); text-align: start;
  }
  .who:hover, .who[aria-expanded='true'] { background: var(--bg-hover); }
  .avatar { width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; object-fit: cover; }
  .avatar.initial {
    display: grid; place-items: center;
    background: var(--accent-deep); color: #fff; font-size: 0.85rem; font-weight: 500;
  }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }
  .menu {
    position: absolute; bottom: calc(100% + 6px); inset-inline-start: -4px; z-index: 10;
    min-width: 160px; padding: 4px;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--bg-raised); box-shadow: var(--shadow);
  }
  /* Items are plain buttons with role="menuitem", an optional icon, a label. */
  .menu :global(button) {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 8px 10px; border-radius: 6px;
    color: var(--text-primary); font-size: 0.85rem; text-align: start;
  }
  .menu :global(button:hover) { background: var(--bg-hover); }
</style>

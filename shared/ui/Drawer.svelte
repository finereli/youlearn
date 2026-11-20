<!-- pwa-kit: shell/ui/Drawer.svelte v15 -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  // Slide-in navigation drawer that becomes a permanent sidebar on desktop
  // (>= 768px, matched by the .shell margin in App.svelte). Slides from the
  // start edge in either direction. Escape closes it; the host closes it on
  // any navigation (router.onChange) so the back button works too.
  //
  // Props: open, onclose, entries [{ label, hash, current, count? }] for a
  // flat list, or groups [{ title?, entries }] for titled sections (an admin
  // with פרסום / תוכן / אנשים); `count` draws a small badge. brand snippet
  // (logo + name), footer snippet: one row, the same height as the brand band -
  // AccountMenu (avatar + name, opens Sign out and friends) on the start side,
  // icon buttons on the end (ResetButton, light/dark, settings). Seams:
  // closeLabel, width.
  export interface DrawerEntry { label: string; hash: string; current?: boolean; count?: number }
  export interface DrawerGroup { title?: string; entries: DrawerEntry[] }
  // `list` replaces the generated entries, for a list that needs its own rows
  // (labels with actions, per-row menus).
  let { open = false, onclose, entries = [], groups, brand, list, footer, closeLabel = 'Close menu' }: {
    open?: boolean; onclose?: () => void; entries?: DrawerEntry[]; groups?: DrawerGroup[]
    brand?: Snippet; list?: Snippet; footer?: Snippet; closeLabel?: string
  } = $props()
  const sections = $derived(groups ?? [{ entries }])

  function go(hash: string) {
    location.hash = hash
    onclose?.()
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onclose?.()} />

<button class="scrim" class:open aria-label={closeLabel} tabindex={open ? 0 : -1} onclick={() => onclose?.()}></button>

<nav class="drawer" class:open aria-hidden={!open}>
  {#if brand}
    <div class="brand">{@render brand()}</div>
  {/if}

  {#if list}
    <div class="list">{@render list()}</div>
  {:else}
    <ul>
      {#each sections as g, i}
        {#if i > 0}<li class="separator"></li>{/if}
        {#if g.title}<li class="section-label">{g.title}</li>{/if}
        {#each g.entries as e}
          <li>
            <button class:current={e.current} onclick={() => go(e.hash)} tabindex={open ? 0 : -1}>
              {e.label}
              {#if e.count}<span class="count">{e.count}</span>{/if}
            </button>
          </li>
        {/each}
      {/each}
    </ul>
  {/if}

  {#if footer}
    <div class="footer">{@render footer()}</div>
  {/if}
</nav>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: block;
    width: 100%;
    background: rgba(0, 0, 0, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .scrim.open { opacity: 1; pointer-events: auto; }

  .drawer {
    position: fixed;
    z-index: 41;
    inset-block: 0;
    inset-inline-start: 0;
    width: min(78vw, 300px);
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    /* No bottom padding: the footer carries the safe area, so it can match the
       brand band's height. */
    padding: 0;
    /* Hidden off the start edge. transform isn't direction-aware, so branch
       on the document direction. */
    transform: translateX(-100%);
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.28s;
  }
  :global([dir='rtl']) .drawer { transform: translateX(100%); }
  /* The shadow only while open: translated off-screen, a 40px blur still
     reaches past the drawer's edge and shades the page's start edge. */
  .drawer.open, :global([dir='rtl']) .drawer.open {
    transform: translateX(0);
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.18);
  }

  @media (min-width: 768px) {
    .scrim { display: none; }
    .drawer, .drawer.open, :global([dir='rtl']) .drawer, :global([dir='rtl']) .drawer.open {
      transform: translateX(0);
      box-shadow: none;
      border-inline-end: 1px solid var(--border);
    }
  }

  .brand {
    height: calc(var(--safe-top) + var(--topbar-h));
    display: flex;
    align-items: center;
    padding: var(--safe-top) var(--gutter) 0;
    border-bottom: 1px solid var(--border);
  }
  .drawer { --gutter: 22px; }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 14px 0;
  }

  /* The nav list is the scroll region: a drawer taller than the screen
     scrolls here while brand and footer stay pinned. */
  ul {
    list-style: none;
    padding: 14px 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .section-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent-text);
    letter-spacing: 0.05em;
    padding: 4px 14px 2px;
  }
  .separator {
    height: 1px;
    background: var(--border);
    margin: 10px 14px;
  }
  ul button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    text-align: start;
    padding: 13px 14px;
    border-radius: 12px;
    font-size: 0.95rem;
    color: var(--text-secondary);
    transition: background 0.15s;
  }
  ul button:hover { background: var(--bg-hover); }
  ul button.current {
    background: var(--bg-hover);
    color: var(--accent-text);
    font-weight: 500;
  }
  .count {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--accent-text);
    background: var(--accent-soft, var(--bg-hover));
    padding: 1px 7px;
    border-radius: 99px;
    min-width: 22px;
    text-align: center;
  }

  /* The same height as the brand band (and the top bar), so the sidebar's top
     and bottom edges balance. One row: the account button and icon buttons. */
  .footer {
    margin-top: auto;
    flex-shrink: 0;
    height: calc(var(--topbar-h) + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 var(--gutter) var(--safe-bottom);
    border-top: 1px solid var(--border);
  }
</style>

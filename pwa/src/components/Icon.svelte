<!-- pwa-kit: icons/ui/Icon.svelte v1 -->
<script lang="ts">
  // Inline SVG icon. Draws a Material Symbols glyph from src/lib/icons.ts with
  // no font to download, so it renders instantly. `size` is in px; colour comes
  // from the surrounding `color` (fill: currentColor), same as the old font.
  import { icons } from '../lib/icons'

  let { name, size = 24 }: { name: string; size?: number } = $props()
  const d = $derived(icons[name])
</script>

{#if d}
  <svg
    class="icon"
    width={size}
    height={size}
    viewBox="0 0 960 960"
    fill="currentColor"
    aria-hidden="true"
  >
    <path transform="translate(0 960) scale(1 -1)" {d} />
  </svg>
{/if}

<style>
  .icon {
    display: inline-block;
    vertical-align: middle;
    flex: none;
  }
</style>

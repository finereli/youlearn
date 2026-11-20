<!-- pwa-kit: confirm/ui/ConfirmButton.svelte v1 -->
<script lang="ts">
  // Confirmation for destructive actions, the way reference/behavior.md says:
  // inline two-step, in place. The first tap arms the button and its label
  // becomes "Sure?"; a second tap within a few seconds runs the action. It
  // disarms itself after `ms` or when focus leaves. Never confirm(): the
  // native dialog speaks the browser's language, not the app's.
  //
  // Arming changes only the words, never the look: a menu row stays a menu
  // row, a text link stays a link, a solid button stays solid. The host's
  // `class` decides the shape; the component only makes it the danger colour
  // and adds `.armed` for a host that wants to mark the state further.
  //
  // Seams: `confirmLabel` (the second-tap prompt; keep it short, the button
  // already says what it does), `ms`, `class`.
  import type { Snippet } from 'svelte'

  let { onconfirm, confirmLabel = 'Sure?', ms = 3000, class: cls = '', children, ...rest }: {
    onconfirm: () => void
    confirmLabel?: string
    ms?: number
    class?: string
    children: Snippet
    [key: string]: unknown
  } = $props()

  let armed = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function tap(e: MouseEvent) {
    // Inside a card or a row that opens on tap: arming must not open it.
    e.stopPropagation()
    clearTimeout(timer)
    if (armed) {
      armed = false
      onconfirm()
      return
    }
    armed = true
    timer = setTimeout(() => (armed = false), ms)
  }

  $effect(() => () => clearTimeout(timer))
</script>

<button class="confirm-btn {cls}" class:armed onclick={tap} onblur={() => (armed = false)} aria-live="polite" {...rest}>
  {#if armed}{confirmLabel}{:else}{@render children()}{/if}
</button>

<style>
  .confirm-btn { color: var(--danger); }
  .confirm-btn.armed { font-weight: 600; }
</style>

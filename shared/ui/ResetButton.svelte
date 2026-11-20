<!-- pwa-kit: updates/ui/ResetButton.svelte v5 -->
<script lang="ts">
  // The drawer's reload control, drawn as the Material "autorenew" glyph.
  // Two jobs, one icon: normally it is the manual escape hatch (forget the
  // cached app, load it fresh - updates.reset()); when a new version is
  // already installed and waiting for a quiet moment it lights up in the
  // accent colour and a tap simply reloads into it (updates.apply()). It
  // spins while a reset runs so the tap visibly did something.
  // Seams: the two labels (updateLabel is an imperative - "tap to update";
  // resetLabel names the action - "reload").
  import { updates } from '../lib/updates.svelte'

  let { tabindex = 0, updateLabel = 'Tap to update', resetLabel = 'Reload' }: { tabindex?: number; updateLabel?: string; resetLabel?: string } = $props()
  const label = $derived(updates.available ? updateLabel : resetLabel)
</script>

<button
  class="reset-btn"
  class:pending={updates.available}
  class:busy={updates.resetting}
  onclick={() => (updates.available ? updates.apply() : updates.reset())}
  aria-label={label}
  title={label}
  {tabindex}
>
  <svg width="16" height="16" viewBox="0 0 960 960" fill="currentColor" aria-hidden="true">
    <path
      transform="translate(0 960) scale(1 -1)"
      d="M240 478Q240 462 242.0 446.5Q244 431 249 416Q254 399 248.0 383.5Q242 368 227 361Q211 353 195.5 359.5Q180 366 175 383Q167 406 163.5 430.0Q160 454 160 478Q160 612 253.0 706.0Q346 800 480 800H487L451 836Q440 847 440.0 864.0Q440 881 451 892Q462 903 479.0 903.0Q496 903 507 892L611 788Q623 776 623.0 760.0Q623 744 611 732L507 628Q496 617 479.0 617.0Q462 617 451 628Q440 639 440.0 656.0Q440 673 451 684L487 720H480Q380 720 310.0 649.5Q240 579 240 478ZM720 482Q720 498 718.0 513.5Q716 529 711 544Q706 561 712.0 576.5Q718 592 733 599Q749 607 764.5 600.5Q780 594 785 577Q793 554 796.5 530.0Q800 506 800 482Q800 348 707.0 254.0Q614 160 480 160H473L509 124Q520 113 520.0 96.0Q520 79 509 68Q498 57 481.0 57.0Q464 57 453 68L349 172Q337 184 337.0 200.0Q337 216 349 228L453 332Q464 343 481.0 343.0Q498 343 509.0 332.0Q520 321 520.0 304.0Q520 287 509 276L473 240H480Q580 240 650.0 310.5Q720 381 720 482Z"
    />
  </svg>
</button>

<style>
  .reset-btn {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin: -6px 0;
    border-radius: 50%;
    color: inherit;
    opacity: 0.6;
    vertical-align: middle;
    transition: color 0.15s, opacity 0.15s;
  }
  .reset-btn:hover { color: var(--accent-deep, var(--accent)); opacity: 1; }
  .pending { color: var(--accent); opacity: 1; }
  .pending:hover { color: var(--accent-deep, var(--accent)); }
  .busy svg { animation: spin 0.9s linear infinite; }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

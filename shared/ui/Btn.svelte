<!-- pwa-kit: shell/ui/Btn.svelte v15 -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  // The button. Variants: primary (solid accent), outline, ghost, danger,
  // danger-ghost. Sizes sm/md/lg. `block` fills the row.
  let {
    variant = 'outline',
    size = 'md',
    block = false,
    disabled = false,
    onclick,
    children,
    ...rest
  }: {
    variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
    onclick?: (e: MouseEvent) => void
    children?: Snippet
    [key: string]: unknown
  } = $props()
</script>

<button class="btn {variant} {size}" class:block {disabled} {onclick} {...rest}>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 500;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
    white-space: nowrap;
    touch-action: manipulation;
  }
  .btn:disabled { opacity: 0.45; pointer-events: none; }
  .btn.block { display: flex; width: 100%; }

  .btn.sm { padding: 5px 14px; font-size: 0.8rem; }
  .btn.md { padding: 8px 18px; font-size: 0.85rem; }
  .btn.lg { padding: 12px 24px; font-size: 0.9rem; }

  .btn.primary { background: var(--accent); color: var(--on-accent, #fff); }
  .btn.primary:hover { filter: brightness(0.92); }

  .btn.outline { border: 1px solid var(--border); color: var(--text-secondary); background: none; }
  .btn.outline:hover { background: var(--bg-hover); color: var(--text-primary); }

  .btn.ghost { color: var(--text-secondary); background: none; }
  .btn.ghost:hover { background: var(--bg-hover); color: var(--text-primary); }

  .btn.danger { background: var(--danger); color: #fff; }
  .btn.danger:hover { background: var(--danger-deep, var(--danger)); }

  .btn.danger-ghost { color: var(--text-secondary); background: none; }
  .btn.danger-ghost:hover { color: var(--danger); }
</style>

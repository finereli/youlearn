<script lang="ts">
  // Which child the console is about: a chip per child, and one to add
  // another. Sits above the pages that belong to one child (watch time,
  // library, devices). The choice is remembered on this phone.
  import { family } from '../../lib/remote.svelte'

  let { selected, onselect }: { selected: string | null; onselect: (id: string) => void } = $props()

  let adding = $state(false)
  let name = $state('')

  function add(e: SubmitEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    family.send({ type: 'child:add', name: n })
    family.pendingSelect = n
    name = ''
    adding = false
  }
</script>

<div class="settings picker">
  {#each family.children as c (c.id)}
    <button class="chip" class:on={c.id === selected} onclick={() => onselect(c.id)}>{c.name}</button>
  {/each}
  {#if adding}
    <form class="add" onsubmit={add}>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field" bind:value={name} placeholder="Name" maxlength="30" autofocus />
      <button class="apply-btn" disabled={!name.trim()}>Add</button>
      <button type="button" class="quiet-btn neutral" onclick={() => (adding = false)}>Cancel</button>
    </form>
  {:else}
    <button class="chip ghost" onclick={() => (adding = true)}>+ Add a child</button>
  {/if}
</div>

<style>
  .picker { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 0 !important; }
  .chip {
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .chip.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 500; }
  .chip.ghost { border-style: dashed; }
  .add { display: flex; gap: 8px; flex: 1; min-width: 260px; }
  .add .field { flex: 1; min-width: 0; }
</style>

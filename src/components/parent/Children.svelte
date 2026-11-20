<script lang="ts">
  // Children and devices: a device belongs to one child, so the page is a
  // section per child with their devices, a code to add one, and the child's
  // own setup (name, removal). A code works once for ten minutes and
  // disappears as soon as a device uses it; removing a device sends it back
  // to the welcome screen at once.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import ConfirmButton from '$shared/ui/ConfirmButton.svelte'
  import Icon from '../Icon.svelte'
  import { clock, family, mmss } from '../../lib/remote.svelte'

  let renaming = $state<string | null>(null)
  let name = $state('')
  function rename(e: SubmitEvent, id: string) {
    e.preventDefault()
    if (name.trim()) family.send({ type: 'child:rename', child: id, name: name.trim() })
    renaming = null
  }
  const code = $derived(family.code && family.code.exp > clock.now ? family.code : null)
</script>

<SettingsPage title="Children and devices">
  {#each family.children as c (c.id)}
    {@const devices = family.devices.filter((d) => d.child === c.id)}
    <section class="kid">
      {#if renaming === c.id}
        <form class="inline" onsubmit={(e) => rename(e, c.id)}>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field" bind:value={name} maxlength="30" autofocus />
          <button class="apply-btn" disabled={!name.trim()}>Save</button>
          <button type="button" class="quiet-btn neutral" onclick={() => (renaming = null)}>Cancel</button>
        </form>
      {:else}
        <div class="head">
          <h3>{c.name}</h3>
          <button class="icon" aria-label={`Rename ${c.name}`} title="Rename" onclick={() => { renaming = c.id; name = c.name }}><Icon name="edit" size={18} /></button>
        </div>
      {/if}

      <ul class="list">
        {#each devices as d (d.id)}
          <li>
            <Icon name="tablet_mac" size={22} />
            <span class="grow">
              <span class="name">{d.name}</span>
              <span class="sub">Added {new Date(d.created).toLocaleDateString()}</span>
            </span>
            <ConfirmButton class="row-btn" confirmLabel="Remove?" onconfirm={() => family.send({ type: 'revoke', device: d.id })}>Remove</ConfirmButton>
          </li>
        {/each}
      </ul>

      {#if code?.child === c.id}
        <p class="hint">On {c.name}'s device, open youlearn.finereli.com and type this code. It works once, for {mmss(code.exp - clock.now)}.</p>
        <p class="code">{code.code.slice(0, 3)} {code.code.slice(3)}</p>
      {:else}
        <div class="confirm-row">
          <button class="quiet-btn neutral add" onclick={() => family.send({ type: 'pair', child: c.id })}><Icon name="add" size={16} /> Add {devices.length ? 'another' : 'a'} device</button>
          <ConfirmButton class="quiet-btn" confirmLabel={`Remove ${c.name} and their shows?`} onconfirm={() => family.send({ type: 'child:remove', child: c.id })}>Remove {c.name}</ConfirmButton>
        </div>
      {/if}
    </section>
  {/each}
  <p class="hint">A device is set up with a code from here: nobody signs in on it, and it only ever shows that child's shows. To add a child, use "+ Add a child" in the menu.</p>
</SettingsPage>

<style>
  .kid { padding-bottom: 24px; border-bottom: 1px solid var(--border); }
  .head { display: flex; align-items: center; gap: 6px; }
  .head h3 { margin: 0; font-size: 1.05rem; }
  .icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: var(--text-secondary); }
  .icon:hover { background: var(--bg-hover); }
  .list { list-style: none; margin: 4px -14px 8px; }
  .list li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--text-secondary); }
  .list li + li { border-top: 1px solid var(--border); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .name { font-size: 0.95rem; color: var(--text-primary); }
  .sub { font-size: 0.8rem; }
  :global(.settings .row-btn) { padding: 8px 12px; font-size: 0.85rem; border-radius: var(--radius); }
  :global(.settings .row-btn:hover) { background: var(--bg-hover); }
  .add { display: inline-flex; align-items: center; gap: 4px; }
  .inline { display: flex; gap: 8px; }
  .inline .field { flex: 1; min-width: 0; }
  .code { font-size: 2.4rem; font-weight: 500; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; color: var(--accent); }
</style>

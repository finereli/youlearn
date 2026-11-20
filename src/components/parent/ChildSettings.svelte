<script lang="ts">
  // A child's setup, under Settings: their devices and a code to add one,
  // their name, and removing them. A code works once for ten minutes; it
  // disappears as soon as a device uses it. Removing a device sends it back
  // to the welcome screen at once.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import ConfirmButton from '$shared/ui/ConfirmButton.svelte'
  import Icon from '../Icon.svelte'
  import { clock, family, mmss } from '../../lib/remote.svelte'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState } = $props()

  let rename = $state('')
  function doRename(e: SubmitEvent) {
    e.preventDefault()
    if (!rename.trim()) return
    family.send({ type: 'child:rename', child: child.id, name: rename.trim() })
    rename = ''
  }

  const devices = $derived(family.devices.filter((d) => d.child === child.id))
  const code = $derived(family.code?.child === child.id && family.code.exp > clock.now ? family.code : null)
</script>

<SettingsPage title={child.name}>
    <section>
      <h3>Devices</h3>
      {#if devices.length}
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
      {:else}
        <p class="hint">None yet.</p>
      {/if}
    </section>

    <section>
      <h3>Add a device</h3>
      {#if code}
        <p class="hint">On {child.name}'s device, open youlearn.finereli.com and type this code. It works once, for {mmss(code.exp - clock.now)}.</p>
        <p class="code">{code.code.slice(0, 3)} {code.code.slice(3)}</p>
      {:else}
        <p class="hint">You'll get a code to type on the new device. Nobody signs in on it.</p>
        <button class="apply-btn" onclick={() => family.send({ type: 'pair', child: child.id })}>Get a code</button>
      {/if}
    </section>

    <section>
      <h3>Name</h3>
      <form class="inline" onsubmit={doRename}>
        <input class="field" bind:value={rename} placeholder="New name" maxlength="30" />
        <button class="apply-btn" disabled={!rename.trim()}>Rename</button>
      </form>
    </section>

    <section>
      <h3>Remove {child.name}</h3>
      <p class="hint">Removing {child.name} also removes their devices and their shows.</p>
      <ConfirmButton class="quiet-btn" confirmLabel={`Remove ${child.name}?`} onconfirm={() => family.send({ type: 'child:remove', child: child.id })}>Remove {child.name}</ConfirmButton>
    </section>
</SettingsPage>

<style>
  .list { list-style: none; margin: 4px -14px 0; }
  .list li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--text-secondary); }
  .list li + li { border-top: 1px solid var(--border); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .name { font-size: 0.95rem; color: var(--text-primary); }
  .sub { font-size: 0.8rem; }
  :global(.settings .row-btn) { padding: 8px 12px; font-size: 0.85rem; border-radius: var(--radius); }
  :global(.settings .row-btn:hover) { background: var(--bg-hover); }
  .inline { display: flex; gap: 8px; margin-top: 8px; }
  .code { font-size: 2.4rem; font-weight: 500; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; color: var(--accent); }
</style>

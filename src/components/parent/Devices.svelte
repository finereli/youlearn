<script lang="ts">
  // The devices paired to the child, and a code to add one. A code works once
  // for ten minutes; it disappears as soon as a device uses it. Removing a
  // device sends it back to the welcome screen at once.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import ConfirmButton from '$shared/ui/ConfirmButton.svelte'
  import Icon from '../Icon.svelte'
  import { clock, family, mmss } from '../../lib/remote.svelte'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState | null } = $props()

  const devices = $derived(child ? family.devices.filter((d) => d.child === child.id) : [])
  const code = $derived(child && family.code?.child === child.id && family.code.exp > clock.now ? family.code : null)
</script>

<SettingsPage title="Devices">
  {#if !child}
    <section><p class="hint">Add your child first, on the <a href="#/">watch time</a> page.</p></section>
  {:else}
    <section>
      <h3>{child.name}'s devices</h3>
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
  {/if}
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
  .code { font-size: 2.4rem; font-weight: 500; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; color: var(--accent); }
</style>

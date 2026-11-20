<script lang="ts">
  // What's set up once and rarely touched: the children (each with their
  // devices), the other parents, AI agents, and this phone's account. Each
  // row's summary says how things stand, so the index reads as finished.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import SettingsRow from '$shared/ui/SettingsRow.svelte'
  import ResetButton from '$shared/ui/ResetButton.svelte'
  import { account, login } from '../../lib/account.svelte'
  import { family, type Agent } from '../../lib/remote.svelte'

  let { onsignout }: { onsignout: () => void } = $props()

  let name = $state('')
  function add(e: SubmitEvent) {
    e.preventDefault()
    family.addChild(name)
    name = ''
  }

  let agents = $state<Agent[] | null>(null)
  $effect(() => {
    family.agents().then((a) => (agents = a))
  })

  const fam = $derived(family.me?.family ?? null)
  const devicesOf = (id: string) => family.devices.filter((d) => d.child === id)
  const others = $derived((fam?.parents.length ?? 1) - 1)
</script>

<SettingsPage title="Settings">
  <section>
    <h3>Children</h3>
    <ul class="rows">
      {#each family.children as c (c.id)}
        {@const ds = devicesOf(c.id)}
        <SettingsRow href={`#/settings/child/${c.id}`} title={c.name} sub={ds.length ? ds.map((d) => d.name).join(', ') : 'No device paired yet'} />
      {/each}
    </ul>
    <form class="inline" onsubmit={add}>
      <input class="field" bind:value={name} placeholder="Add a child" maxlength="30" />
      <button class="apply-btn" disabled={!name.trim()}>Add</button>
    </form>
  </section>

  <section>
    <h3>Family</h3>
    <ul class="rows">
      <SettingsRow href="#/settings/parents" title="Parents" sub={others ? `You and ${others} other${others === 1 ? '' : 's'}` : 'Just you'} />
      <SettingsRow href="#/settings/agents" title="Agents" sub={agents === null ? 'AI assistants that manage the shows' : agents.length ? `${agents.length} connected` : 'None connected'} />
    </ul>
  </section>

  <section>
    <h3>Account</h3>
    <p class="hint">Signed in as {account.user?.email}.</p>
    <div class="confirm-row">
      <button class="quiet-btn neutral" onclick={() => login.signIn({ chooseAccount: true })}>Use another account</button>
      <button class="quiet-btn" onclick={onsignout}>Sign out</button>
    </div>
  </section>

  <p class="foot">
    <span class="dot" class:ok={family.conn === 'connected'}></span>{family.conn === 'connected' ? 'Connected' : 'Connecting…'}
    <ResetButton />
    <span>v{__BUILD__}</span>
  </p>
</SettingsPage>

<style>
  .inline { display: flex; gap: 8px; margin-top: 10px; }
  .inline .field { flex: 1; min-width: 0; }
  .foot { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }
  .dot.ok { background: var(--ok); }
</style>

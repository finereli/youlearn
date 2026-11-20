<script lang="ts">
  // The settings index (kit settings, multi-pane): what's set up once. Each
  // row's summary says how things stand.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import SettingsRow from '$shared/ui/SettingsRow.svelte'
  import { account } from '../../lib/account.svelte'
  import { family, type Agent } from '../../lib/remote.svelte'

  let agents = $state<Agent[] | null>(null)
  $effect(() => {
    family.agents().then((a) => (agents = a))
  })

  const others = $derived((family.me?.family?.parents.length ?? 1) - 1)
  const devicesSub = $derived(
    family.children.map((c) => {
      const n = family.devices.filter((d) => d.child === c.id).length
      return `${c.name}: ${n ? `${n} device${n === 1 ? '' : 's'}` : 'none'}`
    }).join(' · ') || 'No children yet',
  )
</script>

<SettingsPage title="Settings">
  <ul class="rows">
    <SettingsRow href="#/settings/children" title="Children and devices" sub={devicesSub} />
    <SettingsRow href="#/settings/parents" title="Parents" sub={others ? `You and ${others} other${others === 1 ? '' : 's'}` : 'Just you'} />
    <SettingsRow href="#/settings/agents" title="Agents" sub={agents === null ? 'AI assistants that manage the shows' : agents.length ? `${agents.length} connected` : 'None connected'} />
    <SettingsRow href="#/settings/account" title="Account" sub={account.user?.email ?? ''} />
  </ul>
</SettingsPage>

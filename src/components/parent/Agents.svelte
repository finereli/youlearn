<script lang="ts">
  // The parent's AI assistants: the address to give one, and the ones
  // connected. An agent works on the library (worker/mcp.ts) as the parent
  // who approved it. The list is fetched each time the page opens, since an
  // agent may have connected from elsewhere.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import AgentsPanel from '$shared/ui/AgentsPanel.svelte'
  import { family, type Agent } from '../../lib/remote.svelte'

  let agents = $state<Agent[]>([])
  $effect(() => {
    family.agents().then((a) => (agents = a))
  })

  function revoke(id: string) {
    agents = agents.filter((a) => a.id !== id)
    family.disconnect(id)
  }
</script>

<SettingsPage title="Agents">
  <AgentsPanel address={location.origin + '/mcp'} {agents} onRevoke={revoke} />
  <section>
    <h3>What it can do</h3>
    <p class="hint">Change each child's shows: add catalog shows and single videos, remove and reorder them, and, for agents that can run code (Claude Code, Codex), build whole shows from a channel's full episodes by season. It can't see anything else, and it stops working the moment you disconnect it here or leave the family.</p>
  </section>
</SettingsPage>

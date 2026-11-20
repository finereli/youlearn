<!-- pwa-kit: mcp/ui/AgentsPanel.svelte v1 -->
<script lang="ts">
  // Settings > Agents: the address to give an agent, and the agents that have been approved, each with a disconnect button.
  // The parent owns the data (load with the list endpoint, revoke optimistically); this only draws it.
  // Re-fetch the list when the panel opens: an agent may have been connected since the settings screen loaded.
  interface Agent {
    id: string
    name: string | null
    last_used: string | null
  }
  let { address, agents, onRevoke }: { address: string; agents: Agent[]; onRevoke: (id: string) => void } = $props()

  let copied = $state(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      copied = true
      setTimeout(() => (copied = false), 1400)
    } catch {
      // clipboard blocked: the field below is selectable
    }
  }
</script>

<section class="agents">
  <h2>Agents</h2>
  <p class="hint">
    Connect Claude, ChatGPT or any agent that supports MCP. Add a custom connector, paste this address, and sign in to allow it.
  </p>
  <div class="address">
    <input readonly value={address} aria-label="Address to give the agent" onfocus={(e) => e.currentTarget.select()} />
    <button type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  </div>
  <h3>Connected</h3>
  {#if agents.length}
    <ul>
      {#each agents as a (a.id)}
        <li>
          <span>{a.name || 'An agent'}</span>
          <span class="hint">{a.last_used ? `used ${a.last_used.slice(0, 10)}` : 'not used yet'}</span>
          <button type="button" aria-label={`Disconnect ${a.name || 'agent'}`} onclick={() => onRevoke(a.id)}>Disconnect</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">None yet.</p>
  {/if}
</section>

<style>
  .hint { color: var(--text-secondary); font-size: 0.9rem; }
  .address { display: flex; gap: 8px; }
  .address input { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-surface); color: var(--text-primary); font: inherit; }
  button { padding: 8px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-raised); color: var(--text-primary); font: inherit; cursor: pointer; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: center; gap: 12px; }
  li span:first-child { flex: 1; }
</style>

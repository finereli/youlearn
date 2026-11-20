<!-- pwa-kit: mcp/ui/AgentsPanel.svelte v2 -->
<script lang="ts">
  // Settings > Agents: the address to give an agent, and the agents that have been approved, each with a disconnect button.
  // The parent owns the data (load with the list endpoint, revoke optimistically); this only draws it.
  // Re-fetch the list when the panel opens: an agent may have been connected since the settings screen loaded.
  // Goes inside a SettingsPage, which carries the page title: this draws two plain settings sections (h3 + hint) in
  // settings.css's classes, so it looks like the app's other settings.
  import ConfirmButton from './ConfirmButton.svelte'

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
      // clipboard blocked: the field is selectable
    }
  }
</script>

<section>
  <h3>Connect an agent</h3>
  <p class="hint">Claude, ChatGPT or any agent that supports MCP: add a custom connector, paste this address, and sign in to allow it.</p>
  <div class="address">
    <input class="field" readonly value={address} aria-label="Address to give the agent" onfocus={(e) => e.currentTarget.select()} />
    <button type="button" class="quiet-btn neutral" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  </div>
</section>

<section>
  <h3>Connected</h3>
  {#if agents.length}
    <ul class="list">
      {#each agents as a (a.id)}
        <li>
          <span class="grow">
            <span class="name">{a.name || 'An agent'}</span>
            <span class="sub">{a.last_used ? `Last used ${new Date(a.last_used.replace(' ', 'T') + 'Z').toLocaleDateString()}` : 'Not used yet'}</span>
          </span>
          <ConfirmButton class="row-btn" confirmLabel="Disconnect?" onconfirm={() => onRevoke(a.id)}>Disconnect</ConfirmButton>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">None yet.</p>
  {/if}
</section>

<style>
  .address { display: flex; gap: 8px; margin-top: 10px; }
  .address .field { flex: 1; min-width: 0; }
  .list { list-style: none; margin: 4px -14px 0; }
  .list li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 52px; }
  .list li + li { border-top: 1px solid var(--border); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .name { font-size: 0.95rem; }
  .sub { font-size: 0.8rem; color: var(--text-secondary); }
</style>

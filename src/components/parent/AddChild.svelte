<script lang="ts">
  // Who's watching? The first screen of a new family, and "+ Add a child" in
  // the drawer. Once the server has made the child, their page opens.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import { family } from '../../lib/remote.svelte'

  let name = $state('')
  let waiting = $state<{ name: string; before: string[] } | null>(null)

  function add(e: SubmitEvent) {
    e.preventDefault()
    if (!name.trim()) return
    waiting = { name: name.trim(), before: family.children.map((c) => c.id) }
    family.addChild(name)
    name = ''
  }

  $effect(() => {
    const w = waiting
    const made = w && family.children.find((c) => c.name === w.name && !w.before.includes(c.id))
    if (made) history.replaceState(null, '', `#/child/${made.id}`), dispatchEvent(new HashChangeEvent('hashchange'))
  })
</script>

<SettingsPage title="Add a child">
  <section>
    <h3>Who's watching?</h3>
    <p class="hint">Your child's name, as their device will greet them. Each child gets their own watch time, shows and devices.</p>
    <form class="inline" onsubmit={add}>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field" bind:value={name} placeholder="Name" maxlength="30" autofocus={family.children.length > 0} />
      <button class="apply-btn" disabled={!name.trim()}>Add</button>
    </form>
  </section>
</SettingsPage>

<style>
  .inline { display: flex; gap: 8px; }
  .inline .field { flex: 1; min-width: 0; }
</style>

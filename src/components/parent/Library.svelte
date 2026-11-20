<script lang="ts">
  // What the child can watch: the shows on her home page, the catalog shows
  // that aren't (one tap to add), and "More videos", single videos a parent
  // pastes a link to. Building a new show is an agent's job (worker/mcp.ts),
  // so this page only says where to connect one.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import ConfirmButton from '$shared/ui/ConfirmButton.svelte'
  import { family } from '../../lib/remote.svelte'
  import { CATALOG, thumb, type Show } from '../../../worker/library'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState | null } = $props()

  const lib = $derived(child ? (family.libraries[child.id] ?? null) : null)
  const missing = $derived(lib ? CATALOG.filter((c) => !lib.shows.some((s) => s.id === c.id)) : [])
  const name = $derived(child?.name ?? 'your child')

  let link = $state('')
  let busy = $state(false)
  let error = $state('')

  const episodes = (s: Show) => s.seasons.reduce((n, x) => n + x.videos.length, 0)

  async function edit(change: Omit<Parameters<typeof family.edit>[0], 'child'>) {
    if (!child) return false
    busy = true
    error = (await family.edit({ ...change, child: child.id })) ?? ''
    busy = false
    return !error
  }

  async function add(e: SubmitEvent) {
    e.preventDefault()
    if (await edit({ op: 'add-video', url: link })) link = ''
  }
</script>

<SettingsPage title="Library">
  {#if lib}
    <section>
      <h3>{name}'s shows</h3>
      {#if lib.shows.length}
        <ul class="list">
          {#each lib.shows as s (s.id)}
            <li>
              <img class="art" src={s.art} alt="" loading="lazy" />
              <span class="grow">
                <span class="name">{s.title}</span>
                <span class="sub">{episodes(s)} episodes{s.catalog ? '' : ' · your own'}</span>
              </span>
              <ConfirmButton class="row-btn" confirmLabel="Remove?" onconfirm={() => edit({ op: 'remove-show', id: s.id })}>Remove</ConfirmButton>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">No shows yet.</p>
      {/if}
    </section>

    {#if missing.length}
      <section>
        <h3>Add a show</h3>
        <p class="hint">Full episodes from the official channels, in season order.</p>
        <ul class="list">
          {#each missing as s (s.id)}
            <li>
              <img class="art" src={s.art} alt="" loading="lazy" />
              <span class="grow">
                <span class="name">{s.title}</span>
                <span class="sub">{episodes(s)} episodes</span>
              </span>
              <button class="row-btn add" disabled={busy} onclick={() => edit({ op: 'add-show', id: s.id })}>Add</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <h3>More videos</h3>
      <p class="hint">Single videos that belong to no show. Paste a YouTube link.</p>
      <form class="inline" onsubmit={add}>
        <input class="field" bind:value={link} placeholder="https://youtu.be/..." autocomplete="off" inputmode="url" />
        <button class="apply-btn" disabled={busy || !link.trim()}>Add</button>
      </form>
      {#if error}<p class="error">{error}</p>{/if}
      {#if lib.extras.length}
        <ul class="list">
          {#each lib.extras as v (v.id)}
            <li>
              <img class="thumb" src={thumb(v.id)} alt="" loading="lazy" />
              <span class="grow"><span class="name">{v.title}</span></span>
              <ConfirmButton class="row-btn" confirmLabel="Remove?" onconfirm={() => edit({ op: 'remove-video', id: v.id })}>Remove</ConfirmButton>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h3>Build a new show</h3>
      <p class="hint">Ask an AI agent that can run code, like Claude Code or Codex: it lists the show's official YouTube channel and picks out the full episodes. Connect it on the <a href="#/agents">Agents</a> page, then ask something like "add Bluey to {name}'s YouLearn, full episodes only, by season". Assistants in a browser can add catalog shows and single videos.</p>
    </section>
  {:else}
    <div class="loading"><div class="spinner"></div></div>
  {/if}
</SettingsPage>

<style>
  .list { list-style: none; margin: 8px -14px 0; }
  .list li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 60px; }
  .list li + li { border-top: 1px solid var(--border); }
  .art { width: 80px; aspect-ratio: 2 / 1; object-fit: cover; border-radius: 8px; flex: none; background: var(--bg-hover); }
  .thumb { width: 80px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; flex: none; background: var(--bg-hover); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .name { font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 0.8rem; color: var(--text-secondary); }
  .inline { display: flex; gap: 8px; }
  .add { color: var(--accent-text); font-weight: 500; }
  a { color: var(--accent-text); }
  .loading { display: grid; place-items: center; padding: 64px 0; }
  .spinner { width: 24px; height: 24px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

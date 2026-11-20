<script lang="ts">
  // Home: every child at a glance. A card per child says locked or how long
  // is left and what they're watching, with the everyday buttons right on it;
  // the card's name opens that child's whole remote. With no child yet, it
  // asks who's watching. Below: a one-time welcome for an invited parent, and
  // the family's getting-started checklist.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import Btn from '$shared/ui/Btn.svelte'
  import Icon from '../Icon.svelte'
  import FirstRun from './FirstRun.svelte'
  import { family, mmss } from '../../lib/remote.svelte'
  import { findIn } from '../../lib/library.svelte'

  const ADD = [15, 30, 60]
  const label = (m: number) => (m >= 60 ? `${m / 60} hour` : `${m} min`)

  let name = $state('')
  let adding = $state(false)
  function add(e: SubmitEvent) {
    e.preventDefault()
    family.addChild(name)
    name = ''
    adding = false
  }

  const fam = $derived(family.me?.family ?? null)
  const welcomeKey = $derived(`yl:welcomed:${fam?.id}`)
  let welcomed = $state(true)
  $effect(() => {
    welcomed = !!localStorage.getItem(welcomeKey)
  })
  function dismiss() {
    localStorage.setItem(welcomeKey, '1')
    welcomed = true
  }
</script>

<SettingsPage title="YouLearn">
  {#if fam && !fam.isOwner && !welcomed}
    <section class="note">
      <p><b>You've joined {fam.owner}'s family.</b> You can give the children time, pair their devices and change their shows, just like {fam.owner}.</p>
      <button class="quiet-btn neutral" onclick={dismiss}>Got it</button>
    </section>
  {/if}

  {#if !family.children.length}
    <section>
      <h3>Who's watching?</h3>
      <p class="hint">Your child's name, as their device will greet them.</p>
      <form class="inline" onsubmit={add}>
        <input class="field" bind:value={name} placeholder="Name" maxlength="30" />
        <button class="apply-btn" disabled={!name.trim()}>Add</button>
      </form>
    </section>
  {:else}
    {#each family.children as c (c.id)}
      {@const left = family.remaining(c)}
      {@const paired = family.devices.some((d) => d.child === c.id)}
      {@const hit = c.watching ? findIn(family.libraries[c.id], c.watching.video) : null}
      <section class="kid" class:unlocked={left > 0}>
        <a class="head" href={`#/child/${c.id}`}>
          <span class="who">
            <span class="name">{c.name}</span>
            <span class="state">
              <Icon name={left > 0 ? 'lock_open' : 'lock'} size={16} />
              {#if left > 0}<span class="left">{mmss(left)}</span> left{:else}Locked{/if}
              {#if paired && c.online === 0}<span class="off">· offline</span>{/if}
            </span>
            {#if c.watching}
              <span class="watch">{c.watching.playing ? 'Watching' : 'Paused on'} {hit?.video.title ?? 'a video'}</span>
            {/if}
          </span>
          <Icon name="chevron_right" size={22} />
        </a>
        <div class="grid" class:four={left > 0}>
          {#each ADD as m}
            <Btn onclick={() => family.send({ type: 'add', child: c.id, minutes: m })}>{left > 0 ? '+' : ''}{label(m)}</Btn>
          {/each}
          {#if left > 0}
            <Btn variant="danger" onclick={() => family.send({ type: 'lock', child: c.id })}>Lock</Btn>
          {/if}
        </div>
      </section>
    {/each}

    {#if adding}
      <form class="inline" onsubmit={add}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={name} placeholder="Name" maxlength="30" autofocus />
        <button class="apply-btn" disabled={!name.trim()}>Add</button>
        <button type="button" class="quiet-btn neutral" onclick={() => (adding = false)}>Cancel</button>
      </form>
    {:else}
      <button class="ghost" onclick={() => (adding = true)}>+ Add a child</button>
    {/if}

    {#if fam?.isOwner}
      <div class="first"><FirstRun child={family.children[0]} /></div>
    {/if}
  {/if}
</SettingsPage>

<style>
  .note { padding: 14px 16px; border-radius: var(--radius); background: var(--bg-raised); }
  .note p { margin: 0 0 10px; font-size: 0.95rem; }
  .kid { padding: 14px 16px 16px; border-radius: var(--radius); background: var(--bg-raised); margin-bottom: 14px; }
  .head { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); text-decoration: none; margin-bottom: 12px; }
  .who { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .name { font-size: 1.25rem; font-weight: 500; color: var(--text-primary); }
  .state { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; }
  .unlocked .state { color: var(--accent-text); }
  .left { font-variant-numeric: tabular-nums; font-weight: 500; }
  .off { color: #f9e2af; }
  .watch { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .grid.four { grid-template-columns: repeat(4, 1fr); }
  .grid :global(button) { min-width: 0; padding-inline: 4px; white-space: nowrap; }
  .inline { display: flex; gap: 8px; }
  .inline .field { flex: 1; min-width: 0; }
  .ghost { width: 100%; padding: 12px; border: 1px dashed var(--border); border-radius: var(--radius); color: var(--text-secondary); }
  .ghost:hover { background: var(--bg-hover); }
  .first { margin-top: 24px; }
</style>

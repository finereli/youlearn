<script lang="ts">
  // The child's remote: how long she has, what she's watching, and the
  // buttons. Add time stacks on what's left (like Family Link's bonus). "Let
  // her finish" reaches the end of the episode she's on. "Wrap up" only ever
  // shortens, and she sees a countdown. Lock now is immediate.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import Btn from '$shared/ui/Btn.svelte'
  import Icon from '../Icon.svelte'
  import { clock, family, mmss } from '../../lib/remote.svelte'
  import { find, thumb } from '../../lib/library.svelte'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState | null } = $props()

  const ADD = [15, 30, 60]
  const WIND = [2, 3, 5]
  let newName = $state('')

  const left = $derived(child ? family.remaining(child) : 0)
  const unlocked = $derived(left > 0)
  const hit = $derived(child?.watching ? find(child.watching.video) : null)
  // How much longer than her current time "let her finish" gives.
  const gain = $derived.by(() => {
    if (!child?.watching) return 0
    const end = clock.now + family.episodeLeft(child) + 20_000
    return end - Math.max(clock.now, family.until(child) ?? 0)
  })

  function at(ms: number | null) {
    return ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
  }
  function mins(ms: number) {
    const m = Math.ceil(ms / 60_000)
    return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`
  }
  const label = (m: number) => (m >= 60 ? `${m / 60} hour` : `${m} min`)

  function addChild(e: SubmitEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    family.send({ type: 'child:add', name: newName.trim() })
    newName = ''
  }
</script>

<SettingsPage title={child?.name ?? 'Watch time'}>
  {#if !child}
    <section>
      <h3>Who's watching?</h3>
      <p class="hint">Your child's name, as their device will greet them.</p>
      <form class="inline" onsubmit={addChild}>
        <input class="field" bind:value={newName} placeholder="Name" maxlength="30" />
        <button class="apply-btn" disabled={!newName.trim()}>Add</button>
      </form>
    </section>
  {:else}
    <section class="status" class:unlocked>
      <Icon name={unlocked ? 'lock_open' : 'lock'} size={26} />
      <div>
        {#if unlocked}
          <p class="time">{mmss(left)}</p>
          <p class="hint">left, until {at(family.until(child))}</p>
        {:else}
          <p class="time">Locked</p>
          <p class="hint">{child.name} can't watch until you add time.</p>
        {/if}
      </div>
    </section>

    {#if child.online === 0}
      <p class="hint warn-text">{child.name}'s device isn't connected right now. Changes reach it when it's back online.</p>
    {/if}

    {#if child.watching}
      <section class="watching">
        <img src={thumb(child.watching.video)} alt="" />
        <div>
          <span class="label">{child.watching.playing ? 'Watching' : 'Paused'}</span>
          <span class="title">{hit?.video.title ?? child.watching.video}</span>
          <span class="hint">{mins(family.episodeLeft(child))} left in the episode</span>
        </div>
      </section>
      {#if gain > 30_000}
        <section>
          <Btn variant="primary" size="lg" block onclick={() => family.send({ type: 'finish', child: child.id })}>
            Let {child.name} finish this episode · +{mins(gain)}
          </Btn>
        </section>
      {/if}
    {/if}

    <section>
      <h3>{unlocked ? 'Add time' : 'Unlock for'}</h3>
      <div class="grid">
        {#each ADD as m}
          <Btn size="lg" onclick={() => family.send({ type: 'add', child: child.id, minutes: m })}>{unlocked ? '+' : ''}{label(m)}</Btn>
        {/each}
      </div>
    </section>

    {#if unlocked}
      <section>
        <h3>Wrap up in</h3>
        <p class="hint">{child.name} sees a countdown, then it locks.</p>
        <div class="grid">
          {#each WIND as m}
            <Btn size="lg" disabled={left <= m * 60_000} onclick={() => family.send({ type: 'wind', child: child.id, minutes: m })}>{m} min</Btn>
          {/each}
        </div>
      </section>
      <section>
        <Btn variant="danger" size="lg" block onclick={() => family.send({ type: 'lock', child: child.id })}>
          <Icon name="lock" size={18} /> Lock now
        </Btn>
      </section>
    {/if}
  {/if}
</SettingsPage>

<style>
  .status { display: flex; align-items: center; gap: 16px; color: var(--text-secondary); }
  .status.unlocked { color: var(--accent); }
  .status .hint { margin: 0; }
  .time { font-size: 2.2rem; font-weight: 500; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.1; }
  .warn-text { color: #f9e2af; }
  .watching { display: flex; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius); }
  .watching img { width: 38%; max-width: 180px; flex: none; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; }
  .watching div { display: grid; gap: 2px; min-width: 0; }
  .watching .hint { margin: 0; }
  .label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent-text); }
  .title { font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  .inline { display: flex; gap: 8px; }
</style>

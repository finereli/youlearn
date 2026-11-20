<script lang="ts">
  // The child's remote: how long she has, what she's watching, and the
  // buttons. Add time stacks on what's left (like Family Link's bonus). "Let
  // her finish" reaches the end of the episode she's on. "Wrap up" only ever
  // shortens, and she sees a countdown. Lock now is immediate.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import Btn from '$shared/ui/Btn.svelte'
  import Icon from '../Icon.svelte'
  import FirstRun from './FirstRun.svelte'
  import { clock, family, mmss } from '../../lib/remote.svelte'
  import { findIn, thumb } from '../../lib/library.svelte'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState } = $props()

  const ADD = [15, 30, 60]
  const WIND = [2, 3, 5]

  const left = $derived(child ? family.remaining(child) : 0)
  const unlocked = $derived(left > 0)
  const hit = $derived(child.watching ? findIn(family.libraries[child.id], child.watching.video) : null)
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

  // The child's shelf, under the remote: what's on their home page.
  const lib = $derived(family.libraries[child.id])
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
</script>

<SettingsPage title={child.name}>
  {#if child}
    <FirstRun {child} />
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

    {#if lib}
      <section class="shelf">
        <a class="shelf-head" href={`#/child/${child.id}/shows`}>
          <span><h3>{child.name}'s shows</h3><span class="hint">{plural(lib.shows.length, 'show')}{lib.extras.length ? `, ${plural(lib.extras.length, 'single video')}` : ''}</span></span>
          <span class="change">Change <Icon name="chevron_right" size={18} /></span>
        </a>
        <a class="strip" href={`#/child/${child.id}/shows`} aria-label={`Change ${child.name}'s shows`}>
          {#each lib.shows as s (s.id)}
            <img src={s.art} alt={s.title} title={s.title} loading="lazy" />
          {/each}
          {#if lib.extras.length}
            <span class="extras">+{lib.extras.length}<small>videos</small></span>
          {/if}
        </a>
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
  .shelf { padding-top: 20px; border-top: 1px solid var(--border); }
  .shelf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; color: inherit; text-decoration: none; margin-bottom: 10px; }
  .shelf-head .hint { margin: 0; }
  .change { display: inline-flex; align-items: center; font-size: 0.85rem; color: var(--accent-text); white-space: nowrap; }
  .strip { display: flex; gap: 8px; overflow-x: auto; margin: 0 -24px; padding: 0 24px 4px; scrollbar-width: none; }
  .strip img { width: 132px; aspect-ratio: 2 / 1; object-fit: cover; border-radius: 8px; flex: none; background: var(--bg-hover); }
  .extras { width: 72px; flex: none; border-radius: 8px; background: var(--bg-raised); display: grid; place-content: center; text-align: center; color: var(--text-primary); font-size: 1.1rem; }
  .extras small { font-size: 0.7rem; color: var(--text-secondary); }
</style>

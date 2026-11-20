<script lang="ts">
  // One show: season tabs and the episode grid.
  import Icon from './Icon.svelte'
  import { progress, thumb, type Show } from '../lib/library.svelte'

  let { show, onback, onplay }: { show: Show; onback: () => void; onplay: (id: string) => void } = $props()

  // Open on the season she was last in, else the season of the episode she
  // last watched in this show, else the first.
  const key = $derived(`yl:season:${show.id}`)
  let picked = $state<string | null>(null)
  const current = $derived(
    show.seasons.find((s) => s.id === (picked ?? localStorage.getItem(key))) ??
      show.seasons.find((s) => s.videos.some((v) => v.id === progress.last)) ??
      show.seasons[0]
  )

  function pick(id: string) {
    picked = id
    localStorage.setItem(key, id)
  }

  const pct = (id: string, duration: number) => progress.pct(id, duration)
</script>

<div class="page">
  <header>
    <button class="back" onclick={onback} aria-label="All shows"><Icon name="arrow_back" size={28} /></button>
    <h1>{show.title}</h1>
  </header>

  {#if show.seasons.length > 1}
    <nav class="tabs">
      {#each show.seasons as s (s.id)}
        <button class:on={s.id === current.id} onclick={() => pick(s.id)}>{s.title}</button>
      {/each}
    </nav>
  {/if}

  <ul class="grid">
    {#each current.videos as v, i (v.id)}
      {@const p = pct(v.id, v.duration)}
      <li>
        <button class="card" onclick={() => onplay(v.id)}>
          <div class="thumb">
            <img src={thumb(v.id)} alt="" loading="lazy" />
            {#if p >= 100}
              <span class="watched"><Icon name="check_circle" size={26} /></span>
            {:else if p > 0}
              <span class="bar" style:width="{p}%"></span>
            {/if}
            <span class="num">{i + 1}</span>
          </div>
          <span class="title">{v.title}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .page {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding: calc(var(--safe-top) + 12px) calc(env(safe-area-inset-right) + 20px) calc(var(--safe-bottom) + 32px) calc(env(safe-area-inset-left) + 20px);
    background: var(--bg-surface);
  }
  header { display: flex; align-items: center; gap: 10px; padding: 6px 0 18px; }
  .back {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-inline-start: -8px;
    border-radius: 50%;
  }
  .back:active { background: var(--bg-hover); }
  h1 { font-size: 1.7rem; font-weight: 800; }

  .tabs { display: flex; gap: 10px; margin-bottom: 18px; overflow-x: auto; scrollbar-width: none; }
  .tabs button {
    flex: none;
    padding: 10px 20px;
    border-radius: 999px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    font-weight: 700;
    font-size: 1.05rem;
  }
  .tabs button.on { background: var(--accent); color: var(--on-accent); }

  .grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 22px 18px;
  }
  .card { display: grid; gap: 8px; width: 100%; text-align: start; }
  .card:active { transform: scale(0.98); }
  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    border-radius: 14px;
    overflow: hidden;
    background: var(--bg-hover);
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bar { position: absolute; left: 0; bottom: 0; height: 6px; background: var(--accent); }
  .watched {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    color: var(--accent);
    background: rgba(0, 0, 0, 0.55);
    border-radius: 50%;
    padding: 2px;
  }
  .num {
    position: absolute;
    /* Bottom right: channels bake badges ("HD", logos) into the top left. */
    right: 8px;
    bottom: 10px;
    min-width: 30px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 700;
    text-align: center;
  }
  .title { font-weight: 700; font-size: 1.05rem; line-height: 1.25; }
</style>

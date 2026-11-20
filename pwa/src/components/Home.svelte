<script lang="ts">
  // The episode grid: one season at a time, a "keep watching" card on top.
  import Icon from './Icon.svelte'
  import ResetButton from '$shared/ui/ResetButton.svelte'
  import { collections, find, progress, thumb } from '../lib/library.svelte'

  let { onplay }: { onplay: (id: string) => void } = $props()

  const SEASON_KEY = 'yl:collection'
  let current = $state(localStorage.getItem(SEASON_KEY) || collections[0]?.id)
  const collection = $derived(collections.find((c) => c.id === current) ?? collections[0])
  $effect(() => localStorage.setItem(SEASON_KEY, current))

  // Keep watching: the last episode, if it's partly watched.
  const resume = $derived.by(() => {
    const id = progress.last
    if (!id) return null
    const hit = find(id)
    const p = progress.get(id)
    if (!hit || !p || p.done || p.t < 10) return null
    return { video: hit.video, pct: (100 * p.t) / Math.max(1, hit.video.duration) }
  })

  function pct(id: string, duration: number) {
    const p = progress.get(id)
    if (!p) return 0
    return p.done ? 100 : (100 * p.t) / Math.max(1, duration)
  }
</script>

<div class="home">
  <header>
    <img src="/icons/icon-192.png" alt="" class="logo" />
    <h1>YouLearn</h1>
  </header>

  {#if resume}
    <button class="resume" onclick={() => onplay(resume.video.id)}>
      <div class="thumb">
        <img src={thumb(resume.video.id)} alt="" />
        <span class="bar" style:width="{resume.pct}%"></span>
        <span class="play"><Icon name="play_arrow" size={40} /></span>
      </div>
      <div class="resume-text">
        <span class="label">Keep watching</span>
        <span class="title">{resume.video.title}</span>
      </div>
    </button>
  {/if}

  {#if collections.length > 1}
    <nav class="tabs">
      {#each collections as c (c.id)}
        <button class:on={c.id === collection.id} onclick={() => (current = c.id)}>{c.title}</button>
      {/each}
    </nav>
  {/if}

  <ul class="grid">
    {#each collection.videos as v, i (v.id)}
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

  <footer>
    <span>Version {__BUILD__}</span>
    <ResetButton />
  </footer>
</div>

<style>
  .home {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding: calc(var(--safe-top) + 12px) calc(env(safe-area-inset-right) + 20px) calc(var(--safe-bottom) + 12px) calc(env(safe-area-inset-left) + 20px);
  }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 0 20px; }
  .logo { width: 44px; height: 44px; border-radius: 12px; }
  h1 { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.01em; }

  .resume {
    display: flex;
    align-items: center;
    gap: 18px;
    width: 100%;
    max-width: 640px;
    padding: 12px;
    margin-bottom: 24px;
    border-radius: 20px;
    background: var(--bg-raised);
    text-align: start;
  }
  .resume .thumb { width: 46%; flex: none; }
  .resume-text { display: grid; gap: 6px; }
  .label { font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent-text); }
  .resume .title { font-size: 1.35rem; }
  .play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.2);
  }

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
  .card:active, .resume:active { transform: scale(0.98); }
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
    /* Bottom right: YouTube bakes an "HD" badge into the top left. */
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

  footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 36px 0 12px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
</style>

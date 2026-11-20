<script lang="ts">
  // The home page: one big card per show, and "keep watching" on top.
  import Icon from './Icon.svelte'
  import ResetButton from '$shared/ui/ResetButton.svelte'
  import { find, library, progress, thumb, type Show } from '../lib/library.svelte'

  let { onshow, onplay }: { onshow: (id: string) => void; onplay: (id: string) => void } = $props()

  const resume = $derived.by(() => {
    const id = progress.last
    if (!id) return null
    const hit = find(id)
    const p = progress.get(id)
    if (!hit || !p || p.done || p.t < 10) return null
    return { ...hit, pct: progress.pct(id, hit.video.duration) }
  })

  const count = (s: Show) => s.seasons.reduce((n, x) => n + x.videos.length, 0)
</script>

<div class="page">
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
        <span class="sub">{resume.show.title} · {resume.season.title}</span>
      </div>
    </button>
  {/if}

  <ul class="shows">
    {#each library.shows as s (s.id)}
      <li>
        <button class="show" onclick={() => onshow(s.id)}>
          <img src={s.art} alt="" />
          <span class="name">{s.title}</span>
          <span class="sub">{s.id === 'extras' ? (count(s) === 1 ? '1 video' : `${count(s)} videos`) : `${s.seasons.length === 1 ? '1 season' : `${s.seasons.length} seasons`} · ${count(s)} episodes`}</span>
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
  .page {
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
    margin-bottom: 28px;
    border-radius: 20px;
    background: var(--bg-raised);
    text-align: start;
  }
  .resume .thumb {
    position: relative;
    width: 46%;
    flex: none;
    aspect-ratio: 16 / 9;
    border-radius: 14px;
    overflow: hidden;
  }
  .resume .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bar { position: absolute; left: 0; bottom: 0; height: 6px; background: var(--accent); }
  .play { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; background: rgba(0, 0, 0, 0.2); }
  .resume-text { display: grid; gap: 4px; }
  .label { font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent-text); }
  .title { font-size: 1.35rem; font-weight: 700; }
  .sub { font-size: 0.95rem; color: var(--text-secondary); }

  .shows {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 26px 20px;
  }
  .show { display: grid; gap: 4px; width: 100%; text-align: start; }
  .show img {
    width: 100%;
    aspect-ratio: 2 / 1;
    object-fit: cover;
    border-radius: 20px;
    background: var(--bg-hover);
    margin-bottom: 6px;
  }
  .name { font-size: 1.4rem; font-weight: 800; }
  .show:active, .resume:active { transform: scale(0.98); }

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

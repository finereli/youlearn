<script lang="ts">
  // The covered player. YouTube's embed runs underneath with its own controls
  // off; a transparent shield over it takes every tap, so nothing inside the
  // frame (title link, logo, end-screen videos) can be touched. While the
  // video isn't playing an opaque poster hides the frame entirely, which keeps
  // YouTube's pause overlay and its "more videos" out of sight. We stop each
  // episode just before its end, so YouTube's end screen never shows; our own
  // end card offers the next episode instead.
  //
  // One catch: iPad Safari may refuse to start playback from our tap, since
  // the tap lands in our page and not in YouTube's frame. If play() hasn't
  // taken in a couple of seconds we open a hole in the middle of the shield
  // and ask for one tap on the video itself. After that first tap the frame's
  // media is unlocked and our buttons work.
  import { onDestroy, onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import { createPlayer, State, type YTPlayer } from '../lib/youtube'
  import { find, nextAfter, progress, thumb, type Video } from '../lib/library.svelte'
  import * as fs from '../lib/fullscreen'

  let { videoId, onback, onnext }: { videoId: string; onback: () => void; onnext: (id: string) => void } = $props()

  type Phase = 'loading' | 'poster' | 'starting' | 'tap' | 'playing' | 'paused' | 'ended' | 'error'

  let root: HTMLDivElement
  let mountEl: HTMLDivElement
  let player: YTPlayer | null = null
  let loadedId = ''

  let phase = $state<Phase>('loading')
  let time = $state(0)
  let duration = $state(0)
  let scrubbing = $state(false)
  let scrubValue = $state(0)
  let controlsShown = $state(true)
  let isFull = $state(false)
  let canFull = $state(false)
  let errorText = $state('')

  const video = $derived<Video | null>(find(videoId)?.video ?? null)
  const next = $derived(nextAfter(videoId))
  // The poster covers the frame whenever it isn't actually showing the
  // episode to her.
  const covered = $derived(phase !== 'playing' && phase !== 'tap')
  const showControls = $derived(phase !== 'playing' || controlsShown || scrubbing)

  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let startTimer: ReturnType<typeof setTimeout> | undefined
  let tick: ReturnType<typeof setInterval> | undefined
  let lastSave = 0

  // How long a play request gets before we decide the browser wants a tap
  // inside the frame.
  const START_GRACE_MS = 2500
  // Stop this far before the end: YouTube's end screen appears at 0.
  const END_GUARD_S = 1.5

  onMount(() => {
    canFull = fs.supported(root)
    const off = fs.onChange(() => (isFull = fs.active()))
    loadedId = videoId
    createPlayer(mountEl, videoId, progress.startAt(videoId), {
      onReady: () => {
        duration = player?.getDuration() || video?.duration || 0
        time = progress.startAt(videoId)
        // Coming from a tap on an episode card, so try to start right away.
        // Browsers that won't autoplay leave us on the poster.
        requestPlay(false)
      },
      onState,
      onError: (code) => {
        phase = 'error'
        errorText = code === 101 || code === 150 ? "This episode can't play here." : "This episode didn't load."
      },
    })
      .then((p) => (player = p))
      .catch(() => {
        phase = 'error'
        errorText = "Couldn't reach YouTube. Check the internet and try again."
      })
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  })

  onDestroy(() => {
    clearInterval(tick)
    clearTimeout(hideTimer)
    clearTimeout(startTimer)
    saveNow()
    player?.destroy()
    if (fs.active()) fs.exit()
  })

  // Navigating to another episode (back/forward, or the end card) reuses the
  // same frame: its media is already unlocked on iPad.
  $effect(() => {
    const id = videoId
    if (player && id !== loadedId) load(id)
  })

  function load(id: string) {
    saveNow()
    loadedId = id
    time = progress.startAt(id)
    duration = find(id)?.video.duration ?? 0
    phase = 'starting'
    player?.loadVideoById({ videoId: id, startSeconds: time })
    armStartTimer(true)
  }

  function requestPlay(fromTap = true) {
    if (!player) return
    if (phase === 'ended') {
      player.seekTo(0, true)
      time = 0
    }
    phase = 'starting'
    player.playVideo()
    armStartTimer(fromTap)
  }

  function armStartTimer(fromTap: boolean) {
    clearTimeout(startTimer)
    startTimer = setTimeout(() => {
      if (phase !== 'starting') return
      // Our tap didn't take: ask for one tap on the video itself. Without a
      // tap (the autoplay try on arrival) just show the poster.
      phase = fromTap ? 'tap' : 'poster'
    }, START_GRACE_MS)
  }

  function onState(s: number) {
    if (s === State.PLAYING) {
      phase = 'playing'
      clearTimeout(startTimer)
      duration = player?.getDuration() || duration
      startTick()
      flashControls()
    } else if (s === State.PAUSED) {
      if (phase === 'playing') phase = 'paused'
      saveNow()
    } else if (s === State.ENDED) {
      finish()
    }
  }

  function startTick() {
    clearInterval(tick)
    tick = setInterval(() => {
      if (!player || phase !== 'playing') return
      const t = player.getCurrentTime()
      if (!scrubbing) time = t
      if (!duration) duration = player.getDuration()
      if (duration && t >= duration - END_GUARD_S) return finish()
      if (Date.now() - lastSave > 5000) saveNow()
    }, 250)
  }

  function finish() {
    if (phase === 'ended') return
    player?.pauseVideo()
    clearInterval(tick)
    progress.finish(loadedId)
    phase = 'ended'
  }

  function saveNow() {
    if (!player || !loadedId || phase === 'ended') return
    lastSave = Date.now()
    const t = player.getCurrentTime?.() ?? time
    progress.save(loadedId, t, duration)
  }

  function togglePlay() {
    if (phase === 'playing') {
      player?.pauseVideo()
      phase = 'paused'
    } else requestPlay()
  }

  function skip(by: number) {
    if (!player) return
    const t = Math.max(0, Math.min((duration || Infinity) - END_GUARD_S - 1, player.getCurrentTime() + by))
    player.seekTo(t, true)
    time = t
    flashControls()
  }

  function commitScrub() {
    scrubbing = false
    player?.seekTo(scrubValue, true)
    time = scrubValue
    flashControls()
  }

  function flashControls() {
    controlsShown = true
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      if (!scrubbing) controlsShown = false
    }, 3500)
  }

  function onShieldTap() {
    if (phase === 'playing') {
      if (controlsShown) {
        controlsShown = false
        clearTimeout(hideTimer)
      } else flashControls()
    } else if (phase === 'paused' || phase === 'poster') requestPlay()
  }

  function toggleFull() {
    if (fs.active()) fs.exit()
    else fs.enter(root)
    flashControls()
  }

  function goNext() {
    if (!next) return
    // Load inside the tap itself, then update the URL; the effect sees the
    // id already loaded and does nothing.
    if (player) load(next.id)
    onnext(next.id)
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement && e.key !== ' ') return
    if (e.key === ' ' || e.key === 'k') togglePlay()
    else if (e.key === 'ArrowLeft') skip(-10)
    else if (e.key === 'ArrowRight') skip(10)
    else if (e.key === 'f') toggleFull()
    else return
    e.preventDefault()
  }

  function clock(s: number) {
    s = Math.max(0, Math.floor(s))
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }
</script>

<div class="player" class:hide-cursor={!showControls} bind:this={root}>
  <div class="frame"><div bind:this={mountEl}></div></div>

  {#if covered}
    <div class="poster" style:background-image="url({thumb(videoId, 'hq')})"></div>
  {/if}

  {#if phase === 'tap'}
    <!-- Bands around a hole in the middle: only the centre of the video can
         be tapped, away from YouTube's title link at the top. -->
    <div class="band top"></div>
    <div class="band bottom"></div>
    <div class="band left"></div>
    <div class="band right"></div>
    <div class="tap-hint">
      <p>Tap the video to start</p>
      <button class="link" onclick={() => (phase = 'poster')}>Cancel</button>
    </div>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="shield" onclick={onShieldTap}></div>
  {/if}

  {#if phase === 'ended'}
    <div class="endcard">
      <p class="done"><Icon name="check_circle" size={28} /> All done!</p>
      {#if next}
        <button class="next" onclick={goNext}>
          <img src={thumb(next.id)} alt="" />
          <span class="next-label">Next episode</span>
          <span class="next-title">{next.title}</span>
        </button>
      {/if}
      <button class="pill" onclick={onback}>Back to episodes</button>
    </div>
  {:else if phase === 'error'}
    <div class="endcard">
      <p class="done">{errorText}</p>
      {#if next}<button class="pill" onclick={goNext}>Next episode</button>{/if}
      <button class="pill" onclick={onback}>Back to episodes</button>
    </div>
  {:else if phase !== 'tap'}
    <div class="controls" class:shown={showControls}>
      <div class="top">
        <button class="round" onclick={onback} aria-label="Back to episodes"><Icon name="arrow_back" size={28} /></button>
        <h1>{video?.title ?? ''}</h1>
        {#if canFull}
          <button class="round" onclick={toggleFull} aria-label={isFull ? 'Exit full screen' : 'Full screen'}>
            <Icon name={isFull ? 'fullscreen_exit' : 'fullscreen'} size={30} />
          </button>
        {/if}
      </div>

      <div class="middle">
        {#if phase === 'loading' || phase === 'starting'}
          <div class="spinner" aria-label="Loading"></div>
        {:else}
          <button class="round mid" onclick={() => skip(-10)} aria-label="Back 10 seconds"><Icon name="replay_10" size={34} /></button>
          <button class="round big" onclick={togglePlay} aria-label={phase === 'playing' ? 'Pause' : 'Play'}>
            <Icon name={phase === 'playing' ? 'pause' : 'play_arrow'} size={64} />
          </button>
          <button class="round mid" onclick={() => skip(10)} aria-label="Forward 10 seconds"><Icon name="forward_10" size={34} /></button>
        {/if}
      </div>

      <div class="bottom">
        <span class="time">{clock(scrubbing ? scrubValue : time)}</span>
        <input
          type="range"
          min="0"
          max={Math.max(1, duration - END_GUARD_S - 1)}
          step="1"
          value={scrubbing ? scrubValue : time}
          style:--pct="{(100 * (scrubbing ? scrubValue : time)) / Math.max(1, duration)}%"
          oninput={(e) => {
            scrubbing = true
            scrubValue = +e.currentTarget.value
          }}
          onchange={commitScrub}
          aria-label="Position"
        />
        <span class="time">{clock(duration)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .player {
    position: absolute;
    inset: 0;
    background: #000;
    overflow: hidden;
    color: #fff;
    overscroll-behavior: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .hide-cursor { cursor: none; }
  .frame, .frame :global(iframe) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .poster {
    position: absolute;
    inset: 0;
    background: #000 center / cover no-repeat;
  }
  .poster::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
  }
  .shield { position: absolute; inset: 0; }

  .band { position: absolute; background: rgba(0, 0, 0, 0.55); }
  .band.top { left: 0; right: 0; top: 0; height: 30%; }
  .band.bottom { left: 0; right: 0; bottom: 0; height: 25%; }
  .band.left { left: 0; top: 30%; bottom: 25%; width: 25%; }
  .band.right { right: 0; top: 30%; bottom: 25%; width: 25%; }
  .tap-hint {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(var(--safe-top) + 24px);
    text-align: center;
    pointer-events: none;
  }
  .tap-hint p { font-size: 1.6rem; font-weight: 700; text-shadow: 0 2px 8px #000; }
  .link { pointer-events: auto; margin-top: 8px; color: #fff; opacity: 0.8; text-decoration: underline; padding: 8px 16px; }

  .controls {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.25s;
  }
  .controls.shown { opacity: 1; }
  .controls.shown button,
  .controls.shown input { pointer-events: auto; }
  .top, .bottom {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(var(--safe-top) + 12px) calc(env(safe-area-inset-right) + 16px) 12px calc(env(safe-area-inset-left) + 16px);
    background: linear-gradient(rgba(0, 0, 0, 0.65), transparent);
  }
  .bottom {
    padding: 24px calc(env(safe-area-inset-right) + 20px) calc(var(--safe-bottom) + 18px) calc(env(safe-area-inset-left) + 20px);
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  }
  h1 {
    flex: 1;
    font-size: 1.25rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  }
  .middle { display: flex; align-items: center; justify-content: center; gap: 40px; }
  .round {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    color: #fff;
    background: rgba(0, 0, 0, 0.35);
  }
  .round.mid { width: 68px; height: 68px; }
  .round.big { width: 112px; height: 112px; background: var(--accent); color: var(--on-accent); }
  .round:active { transform: scale(0.94); }
  .time { font-variant-numeric: tabular-nums; font-size: 0.95rem; min-width: 3.2em; text-align: center; }

  input[type='range'] {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 44px;
    background: transparent;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(to right, var(--accent) var(--pct), rgba(255, 255, 255, 0.35) var(--pct));
  }
  input[type='range']::-moz-range-track {
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(to right, var(--accent) var(--pct), rgba(255, 255, 255, 0.35) var(--pct));
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 28px;
    height: 28px;
    margin-top: -10px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
  }
  input[type='range']::-moz-range-thumb {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: #fff;
  }

  .spinner {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 5px solid rgba(255, 255, 255, 0.25);
    border-top-color: #fff;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .endcard {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 24px;
    text-align: center;
  }
  .done { display: flex; align-items: center; gap: 10px; font-size: 1.6rem; font-weight: 700; }
  .next {
    display: grid;
    gap: 6px;
    width: min(360px, 80vw);
    padding: 10px 10px 14px;
    border-radius: 18px;
    background: var(--bg-raised);
    color: var(--text-primary);
    text-align: start;
  }
  .next img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; }
  .next-label { font-size: 0.85rem; color: var(--accent-text); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0 4px; }
  .next-title { font-size: 1.2rem; font-weight: 700; padding: 0 4px; }
  .next:active { transform: scale(0.98); }
  .pill {
    padding: 12px 24px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-weight: 600;
  }
</style>

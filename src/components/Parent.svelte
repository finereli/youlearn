<script lang="ts">
  // The parent's remote, on the parent's own phone (#/parent). Sign in with
  // Google here and only here. Per child: unlock for a while, add time, let
  // her finish the episode she's on, ask her to wrap up in a few minutes,
  // lock now. Below that, the devices paired to her and a code to add one.
  import { onDestroy } from 'svelte'
  import Icon from './Icon.svelte'
  import { account, login } from '../lib/account.svelte'
  import { clock, family, mmss } from '../lib/remote.svelte'
  import { find, thumb } from '../lib/library.svelte'
  import type { ChildState } from '../../worker/protocol'

  let { onback }: { onback?: () => void } = $props()

  let newName = $state('')
  let newParent = $state('')
  let confirmParent = $state<string | null>(null)

  async function addParent(e: SubmitEvent) {
    e.preventDefault()
    if (await family.addParent(newParent)) newParent = ''
  }
  let confirmRevoke = $state<string | null>(null)

  $effect(() => {
    if (account.user) family.start()
    else family.stop()
  })
  onDestroy(() => family.stop())

  const ADD = [15, 30, 60]
  const WIND = [2, 3, 5]

  function at(ms: number | null) {
    return ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
  }
  function mins(ms: number) {
    const m = Math.ceil(ms / 60_000)
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`
  }
  function label(m: number) {
    return m >= 60 ? `${m / 60} hour` : `${m} min`
  }

  // How much longer than her current time "finish this episode" gives.
  function finishGain(c: ChildState) {
    if (!c.watching) return 0
    const end = clock.now + family.episodeLeft(c) + 20_000
    return end - Math.max(clock.now, family.until(c) ?? 0)
  }

  function addChild(e: SubmitEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    family.send({ type: 'child:add', name: newName.trim() })
    newName = ''
  }

  function signOut() {
    family.stop()
    login.signOut()
  }

  const codeLeft = $derived(family.code ? family.code.exp - clock.now : 0)
</script>

<div class="page">
  <header>
    {#if onback}<button class="round" onclick={onback} aria-label="Back"><Icon name="arrow_back" size={26} /></button>{/if}
    <h1>Parent</h1>
    {#if account.user}
      <span class="dot" class:on={family.conn === 'connected'} title={family.conn}></span>
      <button class="round" onclick={signOut} aria-label="Sign out"><Icon name="logout" size={22} /></button>
    {/if}
  </header>

  {#if !account.user}
    <div class="center">
      <p>Sign in to control watch time on your child's devices.</p>
      <button class="primary" onclick={() => login.signIn()}>Sign in with Google</button>
    </div>
  {:else if family.allowed === false}
    <div class="center">
      {#if family.me?.canStart}
        <p>Start a family to control watch time on your child's devices. You can add other parents after.</p>
        <button class="primary" onclick={() => family.startFamily()}>Start a family</button>
      {:else}
        <p>{account.user.email} isn't a parent in any family. YouLearn is invite-only for now: ask a family's owner to add you.</p>
      {/if}
      <button class="pill" onclick={() => login.signIn({ chooseAccount: true })}>Use another account</button>
      {#if family.error}<p class="error">{family.error}</p>{/if}
    </div>
  {:else if !family.loaded}
    <div class="center"><div class="spinner"></div></div>
  {:else}
    {#each family.children as c (c.id)}
      {@const left = family.remaining(c)}
      {@const unlocked = left > 0}
      {@const gain = finishGain(c)}
      {@const hit = c.watching ? find(c.watching.video) : null}
      <section class="child">
        <div class="status" class:unlocked>
          <Icon name={unlocked ? 'lock_open' : 'lock'} size={28} />
          <div>
            <h2>{c.name}</h2>
            {#if unlocked}
              <p class="big">{mmss(left)} <span>left · until {at(family.until(c))}</span></p>
            {:else}
              <p class="big">Locked</p>
            {/if}
          </div>
        </div>

        <p class="online">
          <span class="dot" class:on={c.online > 0}></span>
          {c.online > 0 ? 'Connected' : 'No device connected'}
        </p>

        {#if c.watching}
          <div class="watching">
            <img src={thumb(c.watching.video)} alt="" />
            <div>
              <span class="label">{c.watching.playing ? 'Watching' : 'Paused'}</span>
              <span class="title">{hit?.video.title ?? c.watching.video}</span>
              <span class="sub">{mins(family.episodeLeft(c))} left in the episode</span>
            </div>
          </div>
        {/if}

        {#if c.watching && gain > 30_000}
          <button class="primary wide" onclick={() => family.send({ type: 'finish', child: c.id })}>
            Let {c.name} finish this episode · +{mins(gain)}
          </button>
        {/if}

        <div class="row">
          {#each ADD as m}
            <button class="pill" onclick={() => family.send({ type: 'add', child: c.id, minutes: m })}>
              {unlocked ? '+' : ''}{label(m)}
            </button>
          {/each}
        </div>

        {#if unlocked}
          <p class="hint">Wrap up in</p>
          <div class="row">
            {#each WIND as m}
              <button class="pill" disabled={left <= m * 60_000} onclick={() => family.send({ type: 'wind', child: c.id, minutes: m })}>
                {m} min
              </button>
            {/each}
          </div>
          <button class="danger wide" onclick={() => family.send({ type: 'lock', child: c.id })}>
            <Icon name="lock" size={20} /> Lock now
          </button>
        {/if}

        <h3>Devices</h3>
        <ul class="devices">
          {#each family.devices.filter((d) => d.child === c.id) as d (d.id)}
            <li>
              <Icon name="tablet_mac" size={22} />
              <span class="dname">{d.name}</span>
              <span class="sub">since {new Date(d.created).toLocaleDateString()}</span>
              {#if confirmRevoke === d.id}
                <button class="link danger-text" onclick={() => family.send({ type: 'revoke', device: d.id })}>Remove?</button>
                <button class="link" onclick={() => (confirmRevoke = null)}>Keep</button>
              {:else}
                <button class="link" onclick={() => (confirmRevoke = d.id)} aria-label="Remove {d.name}"><Icon name="close" size={20} /></button>
              {/if}
            </li>
          {/each}
        </ul>
        {#if family.code?.child === c.id && codeLeft > 0}
          <div class="code">
            <p>On {c.name}'s device, open youlearn.finereli.com and type</p>
            <strong>{family.code.code.slice(0, 3)} {family.code.code.slice(3)}</strong>
            <p class="sub">Works once, for {mmss(codeLeft)}</p>
          </div>
        {:else}
          <button class="pill" onclick={() => family.send({ type: 'pair', child: c.id })}>Add a device</button>
        {/if}
      </section>
    {/each}

    {#if family.children.length === 0}
      <form class="center" onsubmit={addChild}>
        <p>Who's watching?</p>
        <input bind:value={newName} placeholder="Child's name" maxlength="30" />
        <button class="primary" disabled={!newName.trim()}>Add</button>
      </form>
    {/if}

    {#if family.me?.family}
      {@const fam = family.me.family}
      <section class="child parents">
        <h3>Parents</h3>
        <ul class="devices">
          {#each fam.parents as p (p)}
            <li>
              <span class="dname email">{p}</span>
              {#if p === fam.owner}<span class="tag">Owner</span>{/if}
              {#if fam.isOwner && p !== fam.owner}
                {#if confirmParent === p}
                  <button class="link danger-text" onclick={() => { family.removeParent(p); confirmParent = null }}>Remove?</button>
                  <button class="link" onclick={() => (confirmParent = null)}>Keep</button>
                {:else}
                  <button class="link" onclick={() => (confirmParent = p)} aria-label="Remove {p}"><Icon name="close" size={20} /></button>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
        {#if fam.isOwner}
          <form class="add" onsubmit={addParent}>
            <input type="email" bind:value={newParent} placeholder="Another parent's Google email" autocomplete="off" />
            <button class="pill" disabled={!newParent.includes('@')}>Invite</button>
          </form>
        {/if}
        {#if family.error}<p class="error">{family.error}</p>{/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .page {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: calc(var(--safe-top) + 8px) calc(env(safe-area-inset-right) + 16px) calc(var(--safe-bottom) + 24px) calc(env(safe-area-inset-left) + 16px);
  }
  header { display: flex; align-items: center; gap: 10px; padding: 4px 0 16px; max-width: 560px; margin: 0 auto; }
  h1 { flex: 1; font-size: 1.5rem; font-weight: 800; }
  .round { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: var(--text-primary); }
  .round:active { background: var(--bg-hover); }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #8a8a8a; display: inline-block; flex: none; }
  .dot.on { background: #6fcf97; }

  .center { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px 0; text-align: center; color: var(--text-secondary); }
  .spinner { width: 40px; height: 40px; border-radius: 50%; border: 4px solid var(--border); border-top-color: var(--accent); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .child { display: flex; flex-direction: column; gap: 14px; max-width: 560px; margin: 0 auto 28px; padding: 18px; border-radius: 22px; background: var(--bg-raised); }
  .status { display: flex; align-items: center; gap: 14px; color: var(--text-secondary); }
  .status.unlocked { color: var(--accent); }
  h2 { font-size: 1rem; font-weight: 700; color: var(--text-secondary); }
  .big { font-size: 2rem; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .big span { font-size: 0.95rem; font-weight: 500; color: var(--text-secondary); }
  .online { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text-secondary); }

  .watching { display: flex; gap: 12px; align-items: center; padding: 10px; border-radius: 14px; background: var(--bg-surface); }
  .watching img { width: 38%; flex: none; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; }
  .watching div { display: grid; gap: 2px; min-width: 0; }
  .label { font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent-text); }
  .title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 0.85rem; color: var(--text-secondary); }

  .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .hint { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: -6px; }
  .pill, .primary, .danger {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 13px 16px; border-radius: 999px; font-weight: 700;
  }
  .pill { background: var(--bg-hover); color: var(--text-primary); }
  .primary { background: var(--accent); color: var(--on-accent); }
  .danger { background: #5a2a24; color: #ffb3a3; }
  .wide { width: 100%; }
  button:disabled { opacity: 0.35; }
  .pill:active, .primary:active, .danger:active { transform: scale(0.97); }

  h3 { font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin-top: 6px; }
  .devices { list-style: none; display: grid; gap: 4px; }
  .devices li { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .dname { font-weight: 600; }
  .devices .sub { flex: 1; }
  .link { padding: 8px; color: var(--text-secondary); font-weight: 600; }
  .danger-text { color: #ff9a85; }
  .error { color: #ff9a85; font-size: 0.9rem; }
  .parents { gap: 10px; }
  .email { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-text); }
  .add { display: flex; gap: 8px; }
  .add input { flex: 1; width: auto; font-size: 1rem; padding: 10px 14px; text-align: start; }

  .code { text-align: center; padding: 14px; border-radius: 16px; background: var(--bg-surface); display: grid; gap: 6px; }
  .code p { font-size: 0.9rem; color: var(--text-secondary); }
  .code strong { font-size: 2.6rem; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; color: var(--accent); }

  input {
    width: min(280px, 100%); padding: 12px 16px; font-size: 1.1rem; text-align: center;
    color: var(--text-primary); background: var(--bg-surface); border: 2px solid var(--border); border-radius: 14px; outline: none;
  }
  input:focus { border-color: var(--accent); }
</style>

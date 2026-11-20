<script lang="ts">
  // The parent's console, in the kit shell: top bar, drawer (a sidebar on a
  // wide screen), one scrolling body. The drawer has an entry per child, then
  // Settings as an entry of its own (the kit's footer gear was too easy to
  // miss here, where settings hold real setup: devices, parents, agents).
  //   #/child/<id>            the child: their remote, and their shelf below it
  //   #/child/<id>/shows      changing the shelf: shows and single videos
  //   #/add-child             who's watching? (also the first screen)
  //   #/settings              index: children and devices, parents, agents, account
  //   #/settings/<section>
  // Every page about a child has the child in its address, so nothing is
  // "currently selected". #/ opens the first child.
  import TopBar from '$shared/ui/TopBar.svelte'
  import Drawer from '$shared/ui/Drawer.svelte'
  import AccountMenu from '$shared/ui/AccountMenu.svelte'
  import ResetButton from '$shared/ui/ResetButton.svelte'
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import Remote from './parent/Remote.svelte'
  import Library from './parent/Library.svelte'
  import AddChild from './parent/AddChild.svelte'
  import Settings from './parent/Settings.svelte'
  import Children from './parent/Children.svelte'
  import Parents from './parent/Parents.svelte'
  import Agents from './parent/Agents.svelte'
  import Account from './parent/Account.svelte'
  import { account, login } from '../lib/account.svelte'
  import { family } from '../lib/remote.svelte'
  import type { ChildState } from '../../worker/protocol'

  type Section = 'children' | 'parents' | 'agents' | 'account'
  type Route =
    | { view: 'child' | 'shows'; child: ChildState }
    | { view: 'add' }
    | { view: 'settings' }
    | { view: 'section'; section: Section }

  const SECTIONS: Record<Section, string> = { children: 'Children and devices', parents: 'Parents', agents: 'Agents', account: 'Account' }

  function parse(hash: string, children: ChildState[]): Route {
    const m = hash.match(/^#\/child\/([\w-]+)(\/shows)?$/)
    const c = m && children.find((k) => k.id === m[1])
    if (c) return { view: m![2] ? 'shows' : 'child', child: c }
    const s = hash.match(/^#\/settings\/(\w+)$/)?.[1] as Section | undefined
    if (s && s in SECTIONS) return { view: 'section', section: s }
    if (hash.startsWith('#/settings')) return { view: 'settings' }
    if (hash === '#/add-child' || !children.length) return { view: 'add' }
    return { view: 'child', child: children[0] }
  }

  let hash = $state(location.hash)
  let menuOpen = $state(false)
  const route = $derived(parse(hash, family.children))
  $effect(() => {
    const on = () => {
      hash = location.hash
      menuOpen = false
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  })

  // Sub-pages (a child's shelf, a settings section, the settings index) have
  // a back arrow. Going down pushes an entry marked as ours; back pops it,
  // or on a deep link replaces it with the parent page.
  function go(to: string) {
    if (to === location.hash) return
    history.pushState({ pushed: true }, '', to)
    hash = location.hash
    menuOpen = false
  }
  function up() {
    if (history.state?.pushed) history.back()
    else {
      history.replaceState(null, '', parent)
      hash = location.hash
    }
  }
  function onclick(e: MouseEvent) {
    const a = (e.target as Element).closest?.('a[href^="#/"]')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    go(a.getAttribute('href')!)
  }

  const parent = $derived(route.view === 'shows' ? `#/child/${route.child.id}` : route.view === 'section' ? '#/settings' : '#/')
  const section = $derived(route.view === 'section' ? route.section : null)
  const top = $derived(route.view === 'child' || route.view === 'add' || route.view === 'settings')
  const title = $derived(
    route.view === 'child' ? route.child.name
    : route.view === 'shows' ? `${route.child.name}'s shows`
    : route.view === 'add' ? 'Add a child'
    : route.view === 'settings' ? 'Settings'
    : SECTIONS[section ?? 'account'],
  )

  $effect(() => {
    family.start()
    return () => family.stop()
  })

  const ready = $derived(family.allowed === true && family.loaded)
  const current = (id: string) => (route.view === 'child' || route.view === 'shows') && route.child.id === id
  const groups = $derived([
    {
      entries: [
        ...family.children.map((c) => ({ label: c.name, hash: `/child/${c.id}`, current: current(c.id) })),
        { label: '+ Add a child', hash: '/add-child', current: route.view === 'add' },
      ],
    },
    { entries: [{ label: 'Settings', hash: '/settings', current: route.view === 'settings' || route.view === 'section' }] },
  ])

  function signOut() {
    family.stop()
    login.signOut()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="shell" {onclick}>
  <TopBar leading={top || !ready ? 'menu' : 'back'} title={ready ? title : 'YouLearn'} onleading={() => (top || !ready ? (menuOpen = true) : up())} />

  <div class="body">
    {#if family.allowed === false}
      <SettingsPage title="YouLearn">
        <section>
          {#if family.me?.canStart}
            <h3>Welcome to YouLearn</h3>
            <p class="hint">Your child watches the shows you choose, in a player with no recommendations, no comments and no next video pulling them on. You decide when and how long: their device stays locked until you give it time from your phone.</p>
            <p class="hint">Setting up takes two minutes: start a family, add your child, and pair their tablet with a code. You can invite the other parents after.</p>
            <button class="apply-btn big" onclick={() => family.startFamily()}>Start a family</button>
          {:else}
            <h3>{family.me?.signups === 'full' ? 'YouLearn is full for now' : 'Not in a family yet'}</h3>
            {#if family.me?.signups === 'full'}
              <p class="hint">We've reached the number of new families we can take at the moment. If someone already uses YouLearn, ask them to add {account.user?.email} as a parent.</p>
            {:else}
              <p class="hint">{account.user?.email} isn't a parent in any family. YouLearn is invite-only for now: ask a family's owner to add this email.</p>
            {/if}
            <div class="confirm-row">
              <button class="quiet-btn neutral" onclick={() => login.signIn({ chooseAccount: true })}>Use another account</button>
              <button class="quiet-btn" onclick={signOut}>Sign out</button>
            </div>
          {/if}
          {#if family.error}<p class="error">{family.error}</p>{/if}
        </section>
      </SettingsPage>
    {:else if !ready}
      <div class="loading"><div class="spinner"></div></div>
    {:else}
      {#key hash}
        {#if route.view === 'child'}
          <Remote child={route.child} />
        {:else if route.view === 'shows'}
          <Library child={route.child} />
        {:else if route.view === 'add'}
          <AddChild />
        {:else if route.view === 'settings'}
          <Settings />
        {:else if section === 'children'}
          <Children />
        {:else if section === 'parents'}
          <Parents />
        {:else if section === 'agents'}
          <Agents />
        {:else}
          <Account onsignout={signOut} />
        {/if}
      {/key}
    {/if}
  </div>
</div>

<Drawer open={menuOpen} onclose={() => (menuOpen = false)} {groups}>
  {#snippet brand()}
    <span class="brand"><img src="/icons/icon-192.png" alt="" />YouLearn</span>
  {/snippet}
  {#snippet footer()}
    <div class="footer-row">
      <AccountMenu name={account.user?.name || account.user?.email || ''} picture={account.user?.picture || null} tabindex={menuOpen ? 0 : -1}>
        {#snippet menu(close)}
          <button role="menuitem" onclick={() => { close(); signOut() }}>Sign out</button>
        {/snippet}
      </AccountMenu>
      <span class="dot" class:ok={family.conn === 'connected'} title={family.conn}></span>
      <ResetButton tabindex={menuOpen ? 0 : -1} />
      <span class="build">v{__BUILD__}</span>
    </div>
  {/snippet}
</Drawer>

<style>
  .shell { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  @media (min-width: 768px) {
    .shell { margin-inline-start: min(78vw, 300px); }
  }
  .body :global(.apply-btn.big) { padding: 12px 24px; font-size: 1rem; margin-top: 8px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 500; font-size: 1.05rem; }
  .brand img { width: 30px; height: 30px; border-radius: 8px; }
  .footer-row { display: flex; align-items: center; gap: 4px; }
  .build { font-size: 0.7rem; color: var(--text-secondary); opacity: 0.7; font-variant-numeric: tabular-nums; margin-inline-start: 4px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #f59e0b; margin: 0 8px; }
  .dot.ok { background: var(--ok); }
  .loading { display: grid; place-items: center; padding: 64px 0; }
  .spinner { width: 24px; height: 24px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

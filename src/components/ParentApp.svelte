<script lang="ts">
  // The parent's console, organized by how often each part is used:
  //   #/                      Home: a card per child, time at a glance, quick unlock
  //   #/child/<id>            that child's whole remote, and a row to their shows
  //   #/child/<id>/shows      the shows and videos they can watch
  //   #/settings              what's set up once: children, parents, agents, account
  //   #/settings/child/<id>   a child's devices (pairing), name, removal
  //   #/settings/parents      who else runs the remote; the owner invites
  //   #/settings/agents       AI assistants that manage the library over MCP
  // Every page about a child has the child in its address, so nothing is
  // "currently selected" and a page can't show the wrong kid. No drawer: Home
  // has a gear, everything else a back arrow.
  import TopBar from '$shared/ui/TopBar.svelte'
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import Home from './parent/Home.svelte'
  import Remote from './parent/Remote.svelte'
  import Library from './parent/Library.svelte'
  import Settings from './parent/Settings.svelte'
  import ChildSettings from './parent/ChildSettings.svelte'
  import Parents from './parent/Parents.svelte'
  import Agents from './parent/Agents.svelte'
  import Icon from './Icon.svelte'
  import { account, login } from '../lib/account.svelte'
  import { family } from '../lib/remote.svelte'
  import type { ChildState } from '../../worker/protocol'

  type Route =
    | { view: 'home' }
    | { view: 'child' | 'shows' | 'child-settings'; child: ChildState }
    | { view: 'settings' | 'parents' | 'agents' }

  // A route to a child who's gone (removed, maybe by another parent) falls
  // back to where that child was listed.
  function parse(hash: string, children: ChildState[]): Route {
    const kid = (id: string) => children.find((c) => c.id === id)
    let m = hash.match(/^#\/child\/([\w-]+)(\/shows)?$/)
    if (m) {
      const c = kid(m[1])
      return c ? { view: m[2] ? 'shows' : 'child', child: c } : { view: 'home' }
    }
    m = hash.match(/^#\/settings\/child\/([\w-]+)$/)
    if (m) {
      const c = kid(m[1])
      return c ? { view: 'child-settings', child: c } : { view: 'settings' }
    }
    if (hash === '#/settings/parents') return { view: 'parents' }
    if (hash === '#/settings/agents') return { view: 'agents' }
    if (hash.startsWith('#/settings')) return { view: 'settings' }
    return { view: 'home' }
  }

  let hash = $state(location.hash)
  const route = $derived(parse(hash, family.children))
  $effect(() => {
    const on = () => (hash = location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  })

  // History as on the child's side (App.svelte): going deeper pushes an entry
  // marked as ours; back pops it when we pushed it, and otherwise (a deep
  // link, a relaunch) replaces it with the parent page.
  function go(to: string) {
    if (to === location.hash) return
    history.pushState({ pushed: true }, '', to)
    hash = location.hash
  }
  function up() {
    if (history.state?.pushed) history.back()
    else {
      history.replaceState(null, '', parent)
      hash = location.hash
    }
  }
  // In-app links (rows, the checklist) go through go(), so back works.
  function onclick(e: MouseEvent) {
    const a = (e.target as Element).closest?.('a[href^="#/"]')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    go(a.getAttribute('href')!)
  }

  const parent = $derived.by(() => {
    switch (route.view) {
      case 'shows': return `#/child/${route.child.id}`
      case 'child-settings': case 'parents': case 'agents': return '#/settings'
      default: return '#/'
    }
  })
  const title = $derived.by(() => {
    switch (route.view) {
      case 'child': case 'child-settings': return route.child.name
      case 'shows': return `${route.child.name}'s shows`
      case 'settings': return 'Settings'
      case 'parents': return 'Parents'
      case 'agents': return 'Agents'
      default: return 'YouLearn'
    }
  })

  $effect(() => {
    family.start()
    return () => family.stop()
  })

  const ready = $derived(family.allowed === true && family.loaded)
  const home = $derived(route.view === 'home' || !ready)

  function signOut() {
    family.stop()
    login.signOut()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="shell" {onclick}>
  <TopBar leading={home ? 'none' : 'back'} title={ready ? title : 'YouLearn'} onleading={up} trailingLabel="Settings" ontrailing={() => go('#/settings')} trailing={home && ready ? gear : undefined} />

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
      {#key route.view === 'home' ? 'home' : hash}
        {#if route.view === 'child'}
          <Remote child={route.child} />
        {:else if route.view === 'shows'}
          <Library child={route.child} />
        {:else if route.view === 'settings'}
          <Settings onsignout={signOut} />
        {:else if route.view === 'child-settings'}
          <ChildSettings child={route.child} />
        {:else if route.view === 'parents'}
          <Parents />
        {:else if route.view === 'agents'}
          <Agents />
        {:else}
          <Home />
        {/if}
      {/key}
    {/if}
  </div>
</div>

{#snippet gear()}<Icon name="settings" size={22} />{/snippet}

<style>
  .shell { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
  .body :global(.apply-btn.big) { padding: 12px 24px; font-size: 1rem; margin-top: 8px; }
  .loading { display: grid; place-items: center; padding: 64px 0; }
  .spinner { width: 24px; height: 24px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

<script lang="ts">
  // The parent's console, in the kit shell: top bar, drawer (a sidebar on a
  // wide screen), one scrolling body. It shows on any device that isn't a
  // child's and has a parent signed in, at the same address as everything
  // else. Three pages:
  //   #/          the child's remote: time left, add time, wrap up, lock
  //   #/devices   devices paired to the child, and a code to add one
  //   #/library   the shows and videos the child can watch
  //   #/devices   (above)
  //   #/agents    AI assistants that manage the library over MCP
  //   #/parents   who else can run the remote; the owner invites and removes
  import TopBar from '$shared/ui/TopBar.svelte'
  import Drawer from '$shared/ui/Drawer.svelte'
  import AccountMenu from '$shared/ui/AccountMenu.svelte'
  import ResetButton from '$shared/ui/ResetButton.svelte'
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import Remote from './parent/Remote.svelte'
  import Devices from './parent/Devices.svelte'
  import Parents from './parent/Parents.svelte'
  import Library from './parent/Library.svelte'
  import Agents from './parent/Agents.svelte'
  import ChildPicker from './parent/ChildPicker.svelte'
  import { account, login } from '../lib/account.svelte'
  import { family } from '../lib/remote.svelte'

  type View = 'remote' | 'library' | 'devices' | 'agents' | 'parents'
  const VIEWS: View[] = ['library', 'devices', 'agents', 'parents']
  const parse = (): View => VIEWS.find((v) => location.hash === `#/${v}`) ?? 'remote'
  const TITLES: Record<View, string> = { remote: '', library: 'Library', devices: 'Devices', agents: 'Agents', parents: 'Parents' }
  let view = $state<View>(parse())
  let menuOpen = $state(false)

  $effect(() => {
    const on = () => {
      view = parse()
      menuOpen = false
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  })

  $effect(() => {
    family.start()
    return () => family.stop()
  })

  const child = $derived(family.children.find((c) => c.id === family.selected) ?? family.children[0] ?? null)
  // Pages about one child get the picker on top, once there's a child to pick.
  const perChild = $derived(['remote', 'library', 'devices'].includes(view) && family.children.length > 0)
  const entries = $derived([
    { label: 'Watch time', hash: '/', current: view === 'remote' },
    { label: 'Library', hash: '/library', current: view === 'library' },
    { label: 'Devices', hash: '/devices', current: view === 'devices' },
    { label: 'Agents', hash: '/agents', current: view === 'agents' },
    { label: 'Parents', hash: '/parents', current: view === 'parents' },
  ])
  const title = $derived(TITLES[view] || (child?.name ?? 'YouLearn'))
  const ready = $derived(family.allowed === true && family.loaded)

  function signOut() {
    family.stop()
    login.signOut()
  }
</script>

<div class="shell">
  <TopBar leading="menu" {title} onleading={() => (menuOpen = true)} />

  <div class="body">
    {#if family.allowed === false}
      <SettingsPage title="YouLearn">
        <section>
          {#if family.me?.canStart}
            <h3>Start a family</h3>
            <p class="hint">Then add your child, pair their device and invite the other parents.</p>
            <button class="apply-btn" onclick={() => family.startFamily()}>Start a family</button>
          {:else}
            <h3>Not in a family yet</h3>
            <p class="hint">{account.user?.email} isn't a parent in any family. YouLearn is invite-only for now: ask a family's owner to add this email.</p>
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
      {#if perChild}
        <ChildPicker selected={child?.id ?? null} onselect={(id) => family.select(id)} />
      {/if}
      {#if view === 'library'}
      <Library {child} />
    {:else if view === 'agents'}
      <Agents />
    {:else if view === 'devices'}
      <Devices {child} />
    {:else if view === 'parents'}
      <Parents />
      {:else}
        <Remote {child} />
      {/if}
    {/if}
  </div>
</div>

<Drawer open={menuOpen} onclose={() => (menuOpen = false)} {entries}>
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

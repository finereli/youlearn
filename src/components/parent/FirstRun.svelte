<script lang="ts">
  // What a parent new to the console needs to see on the remote, once each:
  //   - an invited parent: whose family they've joined and what they can do
  //   - a family's first days: the steps from "added a child" to "watching",
  //     each a link to where it's done, ticked off as they happen
  // Dismissed per family on this phone; the checklist also goes away by
  // itself once every step is done.
  import Icon from '../Icon.svelte'
  import { family } from '../../lib/remote.svelte'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState } = $props()

  const fam = $derived(family.me?.family ?? null)
  const key = (what: string) => `yl:${what}:${fam?.id}`
  let welcomed = $state(false)
  let hidden = $state(false)
  $effect(() => {
    welcomed = !!localStorage.getItem(key('welcomed'))
    hidden = !!localStorage.getItem(key('started'))
  })
  function dismiss(what: 'welcomed' | 'started') {
    localStorage.setItem(key(what), '1')
    if (what === 'welcomed') welcomed = true
    else hidden = true
  }

  const paired = $derived(family.devices.some((d) => d.child === child.id))
  const steps = $derived([
    { done: true, label: `Add ${child.name}` },
    { done: paired, label: `Pair ${child.name}'s device`, href: '#/settings/children', hint: 'A six-digit code, typed on their tablet.' },
    { done: child.until !== null || !!child.watching, label: 'Give them some time' },
    ...(fam?.isOwner ? [{ done: (fam?.parents.length ?? 1) > 1, label: 'Invite the other parents', href: '#/settings/parents', hint: 'Optional. Each signs in with their own Google account.' }] : []),
  ])
  const allDone = $derived(steps.every((s) => s.done))
</script>

{#if fam && !fam.isOwner && !welcomed}
  <section class="card">
    <p><b>You've joined {fam.owner}'s family.</b> You can give {child.name} time, pair their devices and change their shows, just like {fam.owner}.</p>
    <button class="quiet-btn neutral" onclick={() => dismiss('welcomed')}>Got it</button>
  </section>
{:else if fam?.isOwner && !hidden && !allDone}
  <section class="card">
    <h3>Getting started</h3>
    <ol>
      {#each steps as s}
        <li class:done={s.done}>
          <span class="tick"><Icon name={s.done ? 'check_circle' : 'play_arrow'} size={20} /></span>
          <span class="grow">
            {#if s.href && !s.done}<a href={s.href}>{s.label}</a>{:else}<span>{s.label}</span>{/if}
            {#if s.hint && !s.done}<span class="sub">{s.hint}</span>{/if}
          </span>
        </li>
      {/each}
    </ol>
    <button class="hide" onclick={() => dismiss('started')}>Hide</button>
  </section>
{/if}

<style>
  .card { position: relative; padding: 14px 16px; border-radius: var(--radius); background: var(--bg-raised); }
  .card p { margin: 0 0 10px; font-size: 0.95rem; }
  ol { list-style: none; margin: 8px 0 0; display: grid; gap: 10px; }
  li { display: flex; gap: 10px; align-items: flex-start; }
  .tick { color: var(--accent); flex: none; margin-top: 1px; }
  li.done { color: var(--text-secondary); }
  li.done .tick { color: var(--ok); }
  .grow { display: grid; }
  a { color: var(--accent-text); font-weight: 500; }
  .sub { font-size: 0.82rem; color: var(--text-secondary); }
  .hide { position: absolute; top: 12px; right: 14px; font-size: 0.8rem; color: var(--text-secondary); }
</style>

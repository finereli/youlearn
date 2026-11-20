<script lang="ts">
  // A family's first days, on Home for the owner: the steps from "added a
  // child" to "watching", each a link to where it's done, ticked off as they
  // happen. Hidden per family on this phone, and gone by itself once every
  // step is done.
  import Icon from '../Icon.svelte'
  import { family } from '../../lib/remote.svelte'
  import type { ChildState } from '../../../worker/protocol'

  let { child }: { child: ChildState } = $props()

  const fam = $derived(family.me?.family ?? null)
  const key = (what: string) => `yl:${what}:${fam?.id}`
  let hidden = $state(true)
  $effect(() => {
    hidden = !!localStorage.getItem(key('started'))
  })
  function hide() {
    localStorage.setItem(key('started'), '1')
    hidden = true
  }

  const paired = $derived(family.devices.some((d) => d.child === child.id))
  const steps = $derived([
    { done: true, label: `Add ${child.name}` },
    { done: paired, label: `Pair ${child.name}'s device`, href: `#/settings/child/${child.id}`, hint: 'A six-digit code, typed on their tablet.' },
    { done: child.until !== null || !!child.watching, label: 'Give them some time', hint: 'Tap a time on their card. Their shows appear at once.' },
    ...(fam?.isOwner ? [{ done: (fam?.parents.length ?? 1) > 1, label: 'Invite the other parents', href: '#/settings/parents', hint: 'Optional. Each signs in with their own Google account.' }] : []),
  ])
  const allDone = $derived(steps.every((s) => s.done))
</script>

{#if fam?.isOwner && !hidden && !allDone}
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
    <button class="hide" onclick={hide}>Hide</button>
  </section>
{/if}

<style>
  .card { position: relative; padding: 14px 16px; border-radius: var(--radius); background: var(--bg-raised); }
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

<script lang="ts">
  // Who can run the remote. Every parent can do everything with the child's
  // time and devices; only the owner invites and removes parents. A removed
  // parent's console closes at once.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import ConfirmButton from '$shared/ui/ConfirmButton.svelte'
  import { account } from '../../lib/account.svelte'
  import { family } from '../../lib/remote.svelte'

  let email = $state('')
  const fam = $derived(family.me?.family ?? null)
  const me = $derived(account.user?.email.toLowerCase())

  async function invite(e: SubmitEvent) {
    e.preventDefault()
    if (await family.addParent(email)) email = ''
  }
</script>

<SettingsPage title="Parents">
  {#if fam}
    <section>
      <h3>Parents</h3>
      <p class="hint">Each signs in with their own Google account at youlearn.finereli.com.</p>
      <ul class="list">
        {#each fam.parents as p (p)}
          <li>
            <span class="grow">
              <span class="name">{p}{p === me ? ' (you)' : ''}</span>
              {#if p === fam.owner}<span class="sub">Owner</span>{/if}
            </span>
            {#if fam.isOwner && p !== fam.owner}
              <ConfirmButton class="row-btn" confirmLabel="Remove?" onconfirm={() => family.removeParent(p)}>Remove</ConfirmButton>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    {#if fam.isOwner}
      <section>
        <h3>Invite a parent</h3>
        <p class="hint">Their Google email. They can use YouLearn as soon as they sign in.</p>
        <form class="inline" onsubmit={invite}>
          <input class="field" type="email" bind:value={email} placeholder="name@gmail.com" autocomplete="off" />
          <button class="apply-btn" disabled={!email.includes('@')}>Invite</button>
        </form>
      </section>
    {:else}
      <p class="hint">Only {fam.owner} can invite or remove parents.</p>
    {/if}
    {#if family.error}<p class="error">{family.error}</p>{/if}
  {/if}
</SettingsPage>

<style>
  .list { list-style: none; margin: 4px -14px 0; }
  .list li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 52px; }
  .list li + li { border-top: 1px solid var(--border); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .name { font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 0.8rem; color: var(--accent-text); }
  .inline { display: flex; gap: 8px; }
</style>

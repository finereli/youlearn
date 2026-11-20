<script lang="ts">
  // Who's signed in on this phone, and the way out.
  import SettingsPage from '$shared/ui/SettingsPage.svelte'
  import { account, login } from '../../lib/account.svelte'

  let { onsignout }: { onsignout: () => void } = $props()
</script>

<SettingsPage title="Account">
  <section>
    <h3>Signed in</h3>
    <p class="hint">{account.user?.email}, with Google through finereli login.</p>
    <div class="confirm-row">
      <button class="quiet-btn neutral" onclick={() => login.signIn({ chooseAccount: true })}>Use another account</button>
      <button class="quiet-btn" onclick={onsignout}>Sign out</button>
    </div>
  </section>
</SettingsPage>

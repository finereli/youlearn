<script lang="ts">
  // The first screen on a device that isn't set up yet, the kit's sign-in gate
  // with two ways in. A parent signs in with Google and lands in the console;
  // a child's device takes the code from a parent's phone and becomes that
  // child's. Same address either way.
  import Login from '$shared/ui/Login.svelte'
  import { login } from '../lib/account.svelte'
  import { device } from '../lib/remote.svelte'

  const auth = { ready: true, signIn: () => login.signIn(), signOut: () => login.signOut() }

  let code = $state('')
  let error = $state('')
  let busy = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    busy = true
    error = (await device.pair(code)) ?? ''
    busy = false
    if (error) code = ''
  }
</script>

<Login {auth} title="YouLearn" subtitle="Shows without the rest of YouTube" buttonLabel="Parent? Sign in with Google" compact>
  <form onsubmit={submit}>
    <label for="code">Setting up a child's device? Type the code from a parent's phone.</label>
    <div class="code-row">
      <input
        id="code"
        bind:value={code}
        oninput={() => (code = code.replace(/\D/g, '').slice(0, 6))}
        inputmode="numeric"
        autocomplete="one-time-code"
        placeholder="000000"
      />
      <button class="go" disabled={code.length !== 6 || busy}>{busy ? '…' : 'Done'}</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
  </form>
  <p class="or">or</p>
</Login>

<style>
  form { width: 100%; display: grid; gap: 10px; }
  label { font-size: 0.85rem; line-height: 1.45; color: var(--accent-light); text-align: center; }
  .code-row { display: flex; gap: 8px; }
  input {
    flex: 1;
    width: 0; /* let it shrink: an input's default width is wider than a phone */
    min-width: 0;
    padding: 11px 0 11px 0.4em;
    font-size: 1.4rem;
    letter-spacing: 0.4em;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 12px;
    outline: none;
  }
  input:focus { border-color: var(--accent); }
  .go {
    padding: 0 20px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 500;
  }
  .go:disabled { opacity: 0.4; }
  .error { font-size: 0.85rem; color: #fee2e2; text-align: center; }
  .or {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin: 18px 0 12px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }
  .or::before, .or::after { content: ''; flex: 1; height: 1px; background: rgba(255, 255, 255, 0.2); }
</style>

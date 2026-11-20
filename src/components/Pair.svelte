<script lang="ts">
  // First run on a child's device: type the code from the parent's phone.
  // Nothing here signs in; the code buys this device its own token.
  import { device } from '../lib/remote.svelte'

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

<div class="screen">
  <img src="/icons/icon-192.png" alt="" class="logo" />
  <h1>Set up YouLearn</h1>
  <p>On the parent's phone, open YouLearn and tap <b>Add a device</b>. Then type the code here.</p>

  <form onsubmit={submit}>
    <input
      bind:value={code}
      oninput={() => (code = code.replace(/\D/g, '').slice(0, 6))}
      inputmode="numeric"
      autocomplete="one-time-code"
      placeholder="000000"
      aria-label="Code"
    />
    <button class="go" disabled={code.length !== 6 || busy}>{busy ? 'Checking…' : 'Done'}</button>
  </form>
  {#if error}<p class="error">{error}</p>{/if}

  <a class="parent" href="#/parent">I'm a parent</a>
</div>

<style>
  .screen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 24px);
    text-align: center;
  }
  .logo { width: 72px; height: 72px; border-radius: 18px; }
  h1 { font-size: 1.8rem; font-weight: 800; }
  p { max-width: 26em; color: var(--text-secondary); line-height: 1.45; }
  p b { color: var(--text-primary); }
  form { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 8px; }
  input {
    width: 7.2em;
    padding: 10px 0 10px 0.45em;
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: 0.45em;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    background: var(--bg-raised);
    border: 2px solid var(--border);
    border-radius: 16px;
    outline: none;
  }
  input:focus { border-color: var(--accent); }
  .go {
    padding: 14px 40px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
    font-size: 1.1rem;
  }
  .go:disabled { opacity: 0.4; }
  .error { color: #ff9a85; }
  .parent { margin-top: 24px; color: var(--text-secondary); font-size: 0.9rem; }
</style>

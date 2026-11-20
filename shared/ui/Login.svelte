<!-- pwa-kit: auth/ui/Login.svelte v7 -->
<script lang="ts">
  // Full-screen sign-in gate. Renders the app's mark, name and one Google
  // button; the spinner shows while GSI loads. Seams: props below, and the
  // background colour (accent-deep so the login reads as "the app", not a
  // white form).
  // `children` renders between the subtitle and the button - for an invite
  // variant (someone arriving from a shared deep link sees what they were
  // sent, not a bare wall); `compact` tightens the header to make room for it.
  // `denied` (signed in but not allowed - an admin app) swaps the Google
  // button for `deniedText` and a sign-out button.
  import type { Snippet } from 'svelte'
  // finereli login fits too: anything with ready, signIn and signOut.
  interface GoogleAuth { ready: boolean; signIn(): unknown; signOut(): unknown }
  let {
    auth, title, subtitle = '', icon = '/icons/icon-192.png', buttonLabel = 'Sign in with Google', compact = false, children,
    denied = false, deniedText = 'You do not have access', signOutLabel = 'Sign out',
  }: {
    auth: GoogleAuth; title: string; subtitle?: string; icon?: string; buttonLabel?: string; compact?: boolean; children?: Snippet
    denied?: boolean; deniedText?: string; signOutLabel?: string
  } = $props()
  const logoSize = $derived(compact ? 56 : 80)
</script>

<div class="login" class:compact>
  <div class="card">
    <img src={icon} alt="" width={logoSize} height={logoSize} class="logo" />
    <h1>{title}</h1>
    {#if subtitle}<p class="role">{subtitle}</p>{/if}
    {@render children?.()}

    {#if auth.ready && denied}
      <p class="denied">{deniedText}</p>
      <button class="secondary-btn" onclick={() => auth.signOut()}>{signOutLabel}</button>
    {:else if auth.ready}
      <button class="google-btn" onclick={() => auth.signIn()}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {buttonLabel}
      </button>
    {:else}
      <div class="loading"></div>
    {/if}
  </div>
</div>

<style>
  .login {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: var(--accent-deep, var(--accent));
    padding: 24px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    max-width: 320px;
    width: 100%;
  }
  .logo { border-radius: 50%; margin-bottom: 12px; }
  h1 { font-size: 1.5rem; font-weight: 500; color: #fff; }
  .compact .card { max-width: 360px; }
  .compact h1 { font-size: 1.15rem; }
  .compact .role { margin-bottom: 20px; }
  .role {
    font-size: 0.8rem;
    color: var(--accent-light, rgba(255, 255, 255, 0.7));
    letter-spacing: 0.08em;
    margin-bottom: 32px;
  }
  .denied {
    font-size: 0.9rem;
    color: #fee2e2;
    margin-bottom: 12px;
  }
  .secondary-btn {
    padding: 12px 28px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: var(--radius);
    color: #fff;
    font-size: 0.95rem;
    transition: background 0.15s;
  }
  .secondary-btn:hover { background: rgba(255, 255, 255, 0.1); }
  .google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 13px 20px;
    border-radius: 12px;
    background: #fff;
    color: #3c4043;
    font-size: 0.95rem;
    font-weight: 500;
    transition: box-shadow 0.15s;
  }
  .google-btn:hover { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2); }
  .loading {
    width: 24px;
    height: 24px;
    border: 2.5px solid rgba(255, 255, 255, 0.25);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-top: 20px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

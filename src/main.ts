// pwa-kit: shell/src/main.ts v11
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { updates } from '$shared/lib/updates.svelte'
import { login } from './lib/account.svelte'
import { device } from './lib/remote.svelte'

// Never reload into a new version mid-episode.
updates.init({ canReload: () => !location.hash.startsWith('#/watch/') })

// Finish a parent's sign-in (popup or redirect), and connect a paired device.
login.handleRedirect()
device.start()

export default mount(App, { target: document.getElementById('app')! })

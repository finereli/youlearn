// pwa-kit: shell/src/main.ts v11
import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { updates } from '$shared/lib/updates.svelte'

// Never reload into a new version mid-episode.
updates.init({ canReload: () => !location.hash.startsWith('#/watch/') })

export default mount(App, { target: document.getElementById('app')! })

// pwa-kit: login/lib/account.example.svelte.ts v1
// The parent's sign-in, used only by the console (on the parent's phone). The
// child's device never signs in: it pairs with a code (remote.svelte.ts).
import { FinereliLogin, type LoginUser } from '$shared/lib/finereli-login'

export const login = new FinereliLogin({ storageKey: 'yl:login' })

class Account {
  user = $state<LoginUser | null>(login.user)
  constructor() {
    login.onChange((u) => (this.user = u))
  }
}

export const account = new Account()

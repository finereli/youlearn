# Roadmap

## Done

- **Watch time, by hand.** The parent's console at `#/parent` (finereli
  login) pairs a child's device with a one-time code, then unlocks it for a
  while, adds time, lets her finish the episode, asks her to wrap up in 2-5
  minutes with a countdown, or locks it now. Live over a WebSocket.
- **Families.** An owner and other parents per family; the owner manages
  parents by email. Invite-only for now.

- **The library on the server.** Each family's shows live in its Durable
  Object and reach the iPad live. The console turns catalog shows on and off
  and adds single videos by link.
- **Agents manage the library.** A parent connects Claude, ChatGPT or any MCP
  agent. Agents that can run code build whole shows (full episodes, by
  season); we build no search or channel import of our own.

- **Several children.** Each with their own watch time, devices and library;
  the console picks whose.

## Next

- **Grow the catalog.** More shows with official full episodes, built once
  (by an agent through the same tools, or by hand) and offered to everyone.
- **Open signups** for a public release: families, owners and parents are in
  place; flip `SIGNUPS` to "open" once there's a sign-up and abuse story.

## Later

- **Schedules.** Daily allowances and allowed hours on top of the manual
  timer.
- **Progress across devices.** Resume positions sync per child instead of
  living in each device's localStorage.
- **Offline episodes** for flights and car trips, if there's a clean way.
- **Public release** once accounts and the console exist.

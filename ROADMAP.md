# Roadmap

## Done

- **Watch time, by hand.** From the console a parent unlocks a child's device
  for a while, adds time, lets them finish the episode, asks them to wrap up
  in 2-5 minutes with a countdown, or locks it now. Live over a WebSocket.
- **Families.** An owner and other parents per family; the owner manages
  parents by email.
- **The library on the server.** Each child's shows live in the family's
  Durable Object and reach their devices live. The console turns catalog
  shows on and off and adds single videos by link.
- **Agents manage the library.** A parent connects Claude, ChatGPT or any MCP
  agent. Agents that can run code build whole shows (full episodes, by
  season); we build no search or channel import of our own.
- **Several children.** Each with their own watch time, devices and library.
  The console's Home has a card per child; what's set up once lives in
  Settings.
- **Open sign-ups, capped.** Anyone can start a family, up to 100 new ones,
  with a welcome that says what YouLearn is and a getting-started checklist.

## Next

- **Shared devices.** One tablet paired to several children, with a "who's
  watching?" screen; each child's own timer and shelf follow whoever is
  picked, and progress is kept per child. Kids pick for themselves; a parent
  can force a switch from the console.
- **Grow the catalog.** More shows with official full episodes, built once
  (by an agent through the same tools, or by hand) and offered to everyone.
- **Schedules.** Daily allowances and allowed hours on top of the manual
  timer.
- **Progress across devices.** Resume positions sync per child instead of
  living in each device's localStorage.
- **Offline episodes** for flights and car trips, if there's a clean way.

# ActiveMembersFilter

A single-file BetterDiscord plugin (`ActiveMembersFilter.plugin.js`) that adds a channel-header toggle replacing the member list with only the people currently playing, listening, streaming or watching. Version lives in the `@version` header of the plugin file.

## Build, test, lint

No build step and no dependencies (Node 20 in CI).

```bash
node --check ActiveMembersFilter.plugin.js   # syntax check (the CI "syntax-check" job)
node --test tests/*.test.js                  # unit tests
```

`.\install.ps1` (Windows) copies the plugin into `%APPDATA%\BetterDiscord\plugins`; BetterDiscord hot-reloads it.

## Layout

- `ActiveMembersFilter.plugin.js` — the whole plugin, including the `EXCLUDABLE_APPS` allowlist (browsers/utilities hidden by default, selectable per app in settings).
- `tests/exclusions.test.js` — loads the plugin via `require` with a stubbed `window.BdApi`. The plugin must stay `require`-able under Node.
- `README.md` — user docs plus long debugging notes on Discord internals.

## Gotchas

- Read presence from Discord's `PresenceStore`, not scraped row text: scraped text is language-dependent and breaks on unpainted rows.
- Discord uses `content-visibility: auto` on the member list, so skipped rows measure ~2px tall and `innerText` returns `""`. Use `textContent`, and match on structure rather than measuring rows.
- Mount the toggle button unconditionally so the debug panel is reachable when detection fails.
- Don't run diagnostics sweeps on every pass; they only run when the debug panel asks.
- Bump `@version` and update the README when behaviour changes. The README's "Known issues" and "Debugging notes" sections are kept deliberately.

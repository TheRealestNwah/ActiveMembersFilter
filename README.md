# ActiveFriendsFilter

A [BetterDiscord](https://betterdiscord.app/) plugin that adds a toggle button above the
server member list, filtering it down to only the members who are currently **doing
something** — playing a game, listening to Spotify, streaming, or watching along.

> **Status: work in progress.** The button, sidebar detection and debug tooling are
> working. Row-level filtering is implemented but has not yet been confirmed against a
> live member list. See [Known issues](#known-issues).

## Install

1. Copy `ActiveFriendsFilter.plugin.js` into your BetterDiscord plugins folder:
   - Windows: `%APPDATA%\BetterDiscord\plugins`
   - macOS: `~/Library/Application Support/BetterDiscord/plugins`
   - Linux: `~/.config/BetterDiscord/plugins`
2. Enable it in Discord under **Settings → Plugins**.

On Windows you can run `.\install.ps1` from this folder to do step 1 for you.

## Usage

A small pill-shaped button appears at the top of the member list.

| Button reads | Meaning |
| --- | --- |
| `🎮 Show Active Only` | Member list found. Click to filter. |
| `🎮 Showing Active Only` | Filter is on. Click to restore the full list. |
| `🎮 No member list` (dimmed, dashed) | Nothing detected. Click for the debug panel. |

**Right-click the button** at any time to open an on-screen debug panel. It reports which
detection strategy won, what Discord's own stores say about each member, and the computed
styles of the row elements. The panel has a **📋 Copy** button so the dump can be pasted
into an issue without needing DevTools.

## How detection works

Discord ships obfuscated, hash-suffixed class names that change between builds, so nothing
here matches on a literal class name alone. Each layer tries several strategies in order
and keeps the first that actually works, reporting the scoreboard in the debug panel.

**Finding the member list** — `membersWrap` class → `members_` class → `role="list"` →
geometry (a tall narrow column flush against the right edge). Every candidate must then
pass a plausibility check: 150–460px wide, over 200px tall, containing at least two avatars.

**Finding individual rows** — from each avatar `<img>`, walk to the nearest ancestor
matching `data-list-item-id` → `role="listitem"` → a `member__` class → (last resort) a
geometry walk. Any candidate wrapping more than one avatar is rejected, which is what
excludes the virtualized scroll container without needing to know its height.

**Deciding who is active** — the user ID is read straight out of the avatar URL
(`/avatars/<snowflake>/`), then handed to Discord's own `PresenceStore` via
`BdApi.Webpack`. Activity types 0/1/2/3/5 (playing, streaming, listening, watching,
competing) count as active; type 4 (custom status) does not. If the store can't be
resolved, it falls back to matching text in the row.

## Debugging notes

Kept because these cost real time to work out.

**Rows measured 2px tall.** Walking up from an avatar reached the right element, but
`getBoundingClientRect()` reported `h=2` for every row except the one that happened to be
painted. Discord uses `content-visibility: auto` on the member list; a skipped element
reports only its **padding box**, and the row carries 1px of padding top and bottom —
hence exactly 2px. The fix was not to force the property off but to **stop measuring
rows at all** and match on structure instead.

**`innerText` is layout-aware.** It returns `""` for a subtree the browser has skipped
rendering. The original activity check scraped `innerText`, so it saw text on exactly one
row — the same painted row above. Both symptoms had one cause. Use `textContent` when
reading unpainted DOM.

**Scraped text is a bad signal anyway.** Matching on `"Playing "` / `"Listening to"`
breaks on any non-English client, and the member list often doesn't render an activity
line at all. `PresenceStore` is authoritative and language-independent.

**Don't gate your debug UI behind the thing you're debugging.** An early version only
created the button *after* the member list was found, and bailed out of the update loop if
any `layerContainer` element had children — which is true for tooltips and popouts, not
just modals. Net effect: the button never appeared, and the debug panel it opened was the
only way to find out why. The button now mounts unconditionally and reports its own state.

## Known issues

- **Row filtering is unverified.** The structural selectors above are implemented but have
  not yet been confirmed against a live member list.
- **Hidden rows may leave gaps.** Discord's member list is virtualized. If rows turn out to
  be `position: absolute`, hiding one leaves a hole rather than compacting the list. The
  debug panel flags this if it applies; the fix would be re-stacking each row's
  `translateY`.
- **Only the server member list.** The Friends tab and DM list are not touched.

## License

MIT — see [LICENSE](LICENSE).

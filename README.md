# ActiveFriendsFilter

A [BetterDiscord](https://betterdiscord.app/) plugin that adds a toggle button above the
server member list. Switch it on and the member list is replaced by a list of only the
people currently **doing something** — playing a game, listening to Spotify, streaming, or
watching along.

> **Status: working.** Confirmed against a live server: correct members, correct
> activities, grouped by role with empty groups omitted. Not released anywhere, and the
> version stays at `1.0.0`. See [Known issues](#known-issues) for the remaining limits.

## Install

1. Copy `ActiveFriendsFilter.plugin.js` into your BetterDiscord plugins folder:
   - Windows: `%APPDATA%\BetterDiscord\plugins`
   - macOS: `~/Library/Application Support/BetterDiscord/plugins`
   - Linux: `~/.config/BetterDiscord/plugins`
2. Enable it in Discord under **Settings → Plugins**.

On Windows you can run `.\install.ps1` from this folder to do step 1 for you.

## Usage

A controller icon is added to the channel header toolbar, alongside Discord's own threads,
pins and member-list icons. Click it to toggle the filter; it turns blue while active, and
dims when no member list is detected. If the toolbar cannot be found, the button falls back
to a floating pill over the member list rather than disappearing.

**Click a member** in the panel to open their profile. **Right-click the toolbar icon** for
an on-screen debug panel reporting which detection strategy won, which Discord stores
resolved, and what the plugin believes about every member. It has a **📋 Copy** button, so
the dump can go into an issue without needing DevTools.

## How it works

### Why it renders its own list

The obvious approach — hide the member rows that aren't active — does not work. Discord's
member list is **virtualized**: only rows near the viewport exist in the DOM at all. Hiding
rows also shortens the scroll content, so Discord never renders the next batch, which
pins the result to whoever happened to be on screen when you toggled it.

So the plugin does not filter Discord's list. It reads the underlying state, builds its own
list, and paints it over the member list as an overlay. An overlay rather than DOM surgery
inside React's tree means there is nothing for React to reconcile away on its next render.

### Where the data comes from

Everything comes from Discord's own Flux stores through `BdApi.Webpack`:

| Store | Used for |
| --- | --- |
| `SelectedGuildStore` | Which server is open |
| `GuildMemberStore` | Member ids, nicknames, role ids, name colour |
| `GuildStore` | Role names, hoist flag, position |
| `PresenceStore` | Each member's current activities |
| `UserStore` | Usernames and avatar URLs |

Activity types 0/1/2/3/5 (playing, streaming, listening, watching, competing) count as
active; type 4 (custom status) does not. Bots and system accounts — the ones Discord marks
with an `APP` tag — are excluded. A user who cannot be looked up at all is treated as human,
so a failed lookup never silently drops a real person. Members are grouped by their highest **hoisted**
role, ordered by role position, exactly as Discord groups them — and a group header is only
created alongside its members, so an empty group can never render a stray heading.

User ids scraped from rendered avatars are folded in as a safety net, so the result can
never be worse than the DOM-only approach it replaced.

### Finding the member list

Discord ships obfuscated, hash-suffixed class names that change between builds, so nothing
matches on a literal class name alone. Several strategies are tried in order — `membersWrap`
class → `members_` class → `role="list"` → geometry — and the first that works wins, with
the full scoreboard shown in the debug panel. Candidates must be 150–460px wide, over 200px
tall, and contain at least two avatars.

## Debugging notes

Kept because these cost real time to work out.

**Rows measured 2px tall.** Walking up from an avatar reached the right element, but
`getBoundingClientRect()` reported `h=2` for every row except the one that happened to be
painted. Discord uses `content-visibility: auto` on the member list; a skipped element
reports only its **padding box**, and the row carries 1px of padding top and bottom — hence
exactly 2px.

**`innerText` is layout-aware.** It returns `""` for a subtree the browser has skipped
rendering, so scraping `innerText` saw text on exactly one row — the same painted row.
Both symptoms had one cause. Use `textContent` when reading unpainted DOM.

**Scraped text produces false positives.** One member in the test server is called
`Playing Catchup`. Matching `/Playing /` against a row's text lists them as in-game.
`PresenceStore` has no such problem, and it also reports activities that Discord's own
member list does not render at all.

**Scraped text is a bad signal anyway.** Matching on `"Playing "` / `"Listening to"` breaks
on any non-English client, and the member list often doesn't render an activity line at
all. `PresenceStore` is authoritative and language-independent.

**Don't gate your debug UI behind the thing you're debugging.** An early version only
created the button *after* the member list was found, so when detection failed there was no
button — and the debug panel it opened was the only way to find out why. The button now
mounts unconditionally and reports its own state.

**`layerContainer` is always present and full-screen.** A "is a modal covering the app?"
check measured that container's own rect. Since Discord keeps it mounted permanently as a
full-viewport overlay, any child at all — a tooltip, a hover card — made it look like a
fullscreen modal, and the button was hidden a tick after being created. Measure the
*children*, not the container.

## Known issues

- **Bounded by what Discord has loaded.** Discord fetches guild member lists lazily, so
  `GuildMemberStore` only knows the members the client has actually received. In a large
  server the panel shows the active people among those, not all of them. Nothing
  client-side can enumerate a 10,000-member guild that was never fetched.
- **Only the server member list.** The Friends tab and DM list are not touched.

## License

MIT — see [LICENSE](LICENSE).

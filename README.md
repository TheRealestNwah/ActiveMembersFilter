# ActiveMembersFilter

A [BetterDiscord](https://betterdiscord.app/) plugin that adds a toggle to the channel
header. Switch it on and the server member list is replaced by just the people currently
**doing something** — playing a game, listening to Spotify, streaming, or watching along —
still grouped by role, with the groups nobody is active in left out.

Built because the member list in a busy server is mostly people who aren't around, and
scrolling it to find who is actually playing something is tedious.

## Install

1. Copy `ActiveMembersFilter.plugin.js` into your BetterDiscord plugins folder:
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

Each member shows a status dot (online, idle, do-not-disturb, streaming) on their avatar,
as the native list does.

**Settings → Plugins → ActiveMembersFilter** has a settings panel: which activity types
count as active, whether to exclude bots and apps, and whether to show friends only.
Changes apply immediately.

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
| `GuildRoleStore` / `GuildStore` | Role names, hoist flag, position |
| `PresenceStore` | Each member's activities and status |
| `UserStore` | Usernames, avatars, and the bot/system flags |
| `RelationshipStore` | Friend status, for the friends-only setting |

By default, activity types 0/1/2/3/5 (playing, streaming, listening, watching, competing)
count as active and type 4 (custom status) does not, and bots and system accounts — the ones
Discord marks with an `APP` tag — are excluded. All of that is configurable in the settings
panel. A user who cannot be looked up at all is treated as human and kept, so a failed
lookup never silently drops a real person; the friends-only filter follows the same rule.

Members are grouped by their highest **hoisted** role, ordered by role position, exactly as
Discord groups them — and a group header is only created alongside its members, so an empty
group can never render a stray heading.

For most activities Discord puts the thing itself in `name`, but for streams and for
Spotify `name` is only the platform — a stream carries the game in `state` and the title in
`details`, and Spotify carries the track in `details`. The panel shows the content, so a
stream reads `Streaming HELLDIVERS 2` rather than `Streaming Twitch`, falling back to the
platform when nothing better is set.

When someone plays with a linked console account, Discord tags the activity with a
`platform` (`ps4`, `ps5`, `xbox`), and the panel shows a small icon for it. PC and mobile
show none, since an icon on nearly every row is noise. The marks are the official
PlayStation and Xbox logos, inlined as SVG path data because a BetterDiscord plugin has to
be a single file.

Status indicators reproduce Discord's shapes rather than plain dots: a crescent for idle, a
bar for do-not-disturb, a play triangle for streaming, a ring for offline. Streaming is
taken from the activity type, because Discord reports someone streaming as plain `online`.

User ids scraped from rendered avatars are folded in as a safety net, so the result can
never be worse than the DOM-only approach it replaced.

### Finding roles

Discord has moved guild roles between stores across builds, so the lookup tries
`GuildRoleStore.getRoles` → `GuildStore.getRoles` → `guild.roles`, then falls back to a
per-role getter for builds that expose no enumerable map at all. Reading only one of these
fails silently — no error, just every member collapsing into the ungrouped bucket — so the
debug panel reports which source answered.

### When it updates

The list is rebuilt in response to `PresenceStore` change events, not on a timer. A one
second tick remains, but only to keep the button mounted and the panel positioned; it
reuses the cached sidebar and does no detection work. Detection strategies stop at the
first one that succeeds, so the expensive geometry sweep runs only if every structural
selector fails — or when the debug panel is opened and deliberately asks for the full
scoreboard. A 15 second staleness check acts as a backstop for a missed event.

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
exactly 2px. The fix was not to force the property off but to stop measuring rows at all
and match on structure instead.

**`innerText` is layout-aware.** It returns `""` for a subtree the browser has skipped
rendering, so scraping `innerText` saw text on exactly one row — the same painted row.
Both symptoms had one cause. Use `textContent` when reading unpainted DOM.

**Scraped text is the wrong signal entirely.** Matching `"Playing "` against a row's text
breaks on any non-English client, misses members whose activity line Discord never renders,
and produces false positives — a member whose display name simply begins with "Playing"
matches. `PresenceStore` has none of these problems and is language-independent.

**Don't gate your debug UI behind the thing you're debugging.** An early version only
created the button *after* the member list was found, so when detection failed there was no
button — and the debug panel it opened was the only way to find out why. The button now
mounts unconditionally and reports its own state.

**`layerContainer` is always present and full-screen.** A "is a modal covering the app?"
check measured that container's own rect. Since Discord keeps it mounted permanently as a
full-viewport overlay, any child at all — a tooltip, a hover card — made it look like a
fullscreen modal, and the button was hidden a tick after being created. Measure the
*children*, not the container.

**Diagnostics are not free.** The strategy scoreboards were built by running every
strategy on every pass, which meant a `querySelectorAll("div")` sweep plus a
`getBoundingClientRect()` on every div in the document, once a second, forever — a forced
layout for information nothing was reading. Gathering diagnostics and doing the work are
different jobs; the full sweep now happens only when the debug panel asks for it.

## Known issues

- **Bounded by what Discord has loaded.** Discord fetches guild member lists lazily, so
  `GuildMemberStore` only knows the members the client has actually received. In a large
  server the panel shows the active people among those, not all of them. Nothing
  client-side can enumerate a 10,000-member guild that was never fetched.
- **Only the server member list.** The Friends tab and DM list are not touched.
- **No right-click menu on panel members.** Clicking opens the profile; Discord's own
  context menu (mention, message, roles) is not reproduced.

## License

MIT — see [LICENSE](LICENSE).

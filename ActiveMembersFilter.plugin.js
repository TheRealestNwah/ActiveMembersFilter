/**
 * @name ActiveMembersFilter
 * @author TheRealestNwah
 * @source https://github.com/TheRealestNwah/ActiveMembersFilter
 * @website https://github.com/TheRealestNwah/ActiveMembersFilter
 * @description Adds a toggle button above the server member list that filters it down to members currently playing a game, listening to Spotify, streaming or watching something.
 * @version 1.0.0
 */

module.exports = class ActiveMembersFilter {
    constructor() {
        this.active = false;
        this.button = null;
        this.sidebar = null;
        this.styleId = "amf-style";
        this.cvStyleId = "amf-cv-style";
        this.DEBUG = true; // set to false to silence console logs

        // Populated by the resolvers so the debug panel can report what worked.
        this.sidebarStrategy = null;
        this.sidebarStats = {};
        this.rowStrategy = null;
        this.strategyStats = {};
        this.lastRows = [];
        this.cvOverrideActive = false;
        this.lastError = null;

        this.stores = {
            presence: null,
            relationship: null,
            user: null,
            guildMember: null,
            guild: null,
            selectedGuild: null,
            resolved: false,
        };

        this.panel = null;
        this.panelSignature = null;
        this.lastCollection = null;

        this.buttonHome = null; // "toolbar" | "floating"
        this.buttonLabel = null;
        this._profileOpener = undefined; // undefined = not looked up yet
    }

    log(...args) {
        if (this.DEBUG) console.log("[ActiveMembersFilter]", ...args);
    }

    start() {
        this.injectStyles();
        // Mount immediately and unconditionally. The button must exist even when
        // nothing is detected, otherwise the only way to diagnose a detection
        // failure is gated behind that same detection succeeding.
        this.mountButton();
        this.tick();
        this._mainLoop = setInterval(() => this.tick(), 1000);
        this.log("started");
    }

    stop() {
        clearInterval(this._mainLoop);
        this.active = false;
        this.showAll();
        this.removeStyles();
        document.querySelector(".amf-debug-panel")?.remove();
        if (this.button) this.button.remove();
        this.button = null;
        this.sidebar = null;
    }

    // ---------------------------------------------------------------- styles

    injectStyles() {
        const style = document.createElement("style");
        style.id = this.styleId;
        style.textContent = `
            /* Preferred home: an icon button in the channel header toolbar,
               sized and coloured like Discord's own icons there. */
            .amf-toggle-btn.amf-in-toolbar {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                margin: 0 8px;
                padding: 0;
                border: none;
                border-radius: 4px;
                background: none;
                box-shadow: none;
                cursor: pointer;
                color: var(--interactive-normal, #b5bac1);
            }
            .amf-toggle-btn.amf-in-toolbar:hover {
                color: var(--interactive-hover, #dbdee1);
            }
            .amf-toggle-btn.amf-in-toolbar.amf-active {
                color: var(--brand-experiment, #5865f2);
            }
            .amf-toggle-btn.amf-in-toolbar.amf-idle {
                opacity: 0.4;
            }
            .amf-toggle-btn.amf-in-toolbar .amf-label {
                display: none;
            }
            .amf-toggle-btn svg {
                width: 24px;
                height: 24px;
            }
            /* Fallback if the toolbar can't be found: the old floating pill. */
            .amf-toggle-btn.amf-floating {
                position: fixed;
                top: 90px;
                right: 20px;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                background: var(--background-secondary-alt, #2b2d31);
                color: var(--text-normal, #dbdee1);
                border: 1px solid var(--background-modifier-accent, #3f4147);
                user-select: none;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                white-space: nowrap;
            }
            .amf-toggle-btn.amf-floating:hover {
                background: var(--background-modifier-hover, #35373c);
            }
            .amf-toggle-btn.amf-floating.amf-active {
                background: var(--brand-experiment, #5865f2);
                color: #fff;
                border-color: var(--brand-experiment, #5865f2);
            }
            .amf-toggle-btn.amf-floating.amf-idle {
                opacity: 0.75;
                border-style: dashed;
            }
            .amf-toggle-btn.amf-floating svg {
                width: 16px;
                height: 16px;
            }
            .amf-hidden-row {
                display: none !important;
            }
            /* Our own member list, painted over Discord's. An overlay rather
               than DOM surgery inside React's tree, so there is nothing for
               React to reconcile away on its next render. */
            .amf-panel {
                position: fixed;
                z-index: 9998;
                box-sizing: border-box;
                background: var(--background-secondary, #2b2d31);
                overflow-y: auto;
                overflow-x: hidden;
                padding: 8px 0 16px;
            }
            .amf-panel-head {
                padding: 4px 16px 2px;
                font-size: 12px;
                font-weight: 700;
                color: var(--text-muted, #949ba4);
            }
            .amf-group-head {
                padding: 16px 16px 4px;
                font-size: 12px;
                font-weight: 600;
                color: var(--channels-default, #949ba4);
            }
            .amf-member {
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 0 8px;
                padding: 5px 8px;
                border-radius: 4px;
                cursor: pointer;
            }
            .amf-member:hover {
                background: var(--background-modifier-hover, #35373c);
            }
            .amf-member:active {
                background: var(--background-modifier-selected, #3f4147);
            }
            .amf-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                flex: 0 0 auto;
            }
            .amf-member-text {
                min-width: 0;
            }
            .amf-name {
                font-size: 14px;
                font-weight: 500;
                color: var(--text-normal, #dbdee1);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .amf-activity {
                font-size: 12px;
                color: var(--text-muted, #949ba4);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .amf-empty {
                padding: 28px 16px;
                font-size: 13px;
                line-height: 1.6;
                text-align: center;
                color: var(--text-muted, #949ba4);
            }
            .amf-debug-panel {
                position: fixed;
                z-index: 10000;
                top: 60px;
                right: 20px;
                width: 520px;
                max-height: 76vh;
                overflow-y: auto;
                background: #111214;
                color: #dbdee1;
                border: 1px solid #5865f2;
                border-radius: 8px;
                padding: 12px;
                font-family: monospace;
                font-size: 11px;
                line-height: 1.5;
                white-space: pre-wrap;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            }
            .amf-debug-toolbar {
                position: sticky;
                top: 0;
                display: flex;
                gap: 6px;
                justify-content: flex-end;
                margin-bottom: 6px;
            }
            .amf-debug-toolbar > div {
                cursor: pointer;
                background: #5865f2;
                color: #fff;
                border-radius: 4px;
                padding: 2px 8px;
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);
    }

    removeStyles() {
        document.getElementById(this.styleId)?.remove();
        document.getElementById(this.cvStyleId)?.remove();
        this.cvOverrideActive = false;
    }

    // `content-visibility: auto` lets the browser skip layout for off-screen
    // rows. While skipped, an element reports only its padding box to
    // getBoundingClientRect() (a padded row measures ~2px) and innerText
    // returns "" because innerText is layout-aware. Detection below no longer
    // depends on either, but forcing the property off keeps the geometry
    // fallback honest. Only injected if a row is actually found to use it,
    // since disabling it costs render performance in large servers.
    enableContentVisibilityOverride() {
        if (this.cvOverrideActive) return;
        const style = document.createElement("style");
        style.id = this.cvStyleId;
        style.textContent = `
            [class*="member__"], [class*="memberInner"], [role="listitem"] {
                content-visibility: visible !important;
                contain-intrinsic-size: none !important;
            }
        `;
        document.head.appendChild(style);
        this.cvOverrideActive = true;
        this.log("content-visibility override injected (skipped rows detected)");
    }

    // ----------------------------------------------------------- flux stores

    // Reading activity from Discord's own PresenceStore instead of scraping
    // rendered text: works for rows that never painted, and does not depend
    // on the client's display language.
    getStores() {
        if (this.stores.resolved) return this.stores;
        this.stores.resolved = true;

        const W = window.BdApi?.Webpack;
        if (!W) return this.stores;

        const pick = (name) => {
            try {
                if (W.Stores?.[name]) return W.Stores[name];
                if (typeof W.getStore === "function") {
                    const s = W.getStore(name);
                    if (s) return s;
                }
                if (typeof W.getModule === "function") {
                    return (
                        W.getModule((m) => m?._dispatchToken && m?.getName?.() === name, {
                            searchExports: true,
                        }) || null
                    );
                }
            } catch (e) {
                this.log(`store lookup failed for ${name}`, e);
            }
            return null;
        };

        this.stores.presence = pick("PresenceStore");
        this.stores.relationship = pick("RelationshipStore");
        this.stores.user = pick("UserStore");
        this.stores.guildMember = pick("GuildMemberStore");
        this.stores.guild = pick("GuildStore");
        this.stores.guildRole = pick("GuildRoleStore");
        this.stores.selectedGuild = pick("SelectedGuildStore");
        this.log("stores resolved", this.storeReport());
        return this.stores;
    }

    storeReport() {
        return {
            PresenceStore: !!this.stores.presence,
            RelationshipStore: !!this.stores.relationship,
            UserStore: !!this.stores.user,
            GuildMemberStore: !!this.stores.guildMember,
            GuildStore: !!this.stores.guild,
            GuildRoleStore: !!this.stores.guildRole,
            SelectedGuildStore: !!this.stores.selectedGuild,
        };
    }

    // Discord ActivityType: 0 playing, 1 streaming, 2 listening, 3 watching,
    // 4 custom status, 5 competing. Custom status is just a mood line, not
    // something the user is doing, so it does not count as active.
    activityForUser(userId) {
        const { presence } = this.getStores();
        if (!presence || !userId || typeof presence.getActivities !== "function") return null;

        let acts;
        try {
            acts = presence.getActivities(userId) || [];
        } catch (e) {
            return null;
        }

        const real = acts.filter((a) => a && a.type !== 4);
        if (!real.length) return { active: false, label: "" };

        const a = real[0];
        const verb =
            { 0: "Playing", 1: "Streaming", 2: "Listening to", 3: "Watching", 5: "Competing in" }[
                a.type
            ] || "Active:";
        return { active: true, label: `${verb} ${a.name || "?"}`.trim() };
    }

    isFriend(userId) {
        const { relationship } = this.getStores();
        if (!relationship || !userId || typeof relationship.isFriend !== "function") return null;
        try {
            return relationship.isFriend(userId);
        } catch (e) {
            return null;
        }
    }

    // Richer than activityForUser(): keeps the fields needed to render a row.
    activityInfoForUser(userId) {
        const { presence } = this.getStores();
        if (!presence || !userId || typeof presence.getActivities !== "function") return null;
        let acts;
        try {
            acts = presence.getActivities(userId) || [];
        } catch (e) {
            return null;
        }
        const real = acts.filter((a) => a && a.type !== 4);
        if (!real.length) return null;

        const a = real[0];
        const verb =
            { 0: "Playing", 1: "Streaming", 2: "Listening to", 3: "Watching", 5: "Competing in" }[
                a.type
            ] || "Active:";
        return { type: a.type, verb, name: a.name || "", label: `${verb} ${a.name || "?"}`.trim() };
    }

    // ------------------------------------------------- collecting the list

    currentGuildId() {
        try {
            return this.stores.selectedGuild?.getGuildId?.() || null;
        } catch (e) {
            return null;
        }
    }

    // Every member the client has actually loaded for this guild. Discord
    // fetches member lists lazily, so this is "everyone known", not
    // necessarily "everyone in the server" — see README.
    guildMemberIds(guildId) {
        const gm = this.stores.guildMember;
        if (!gm || !guildId) return [];
        try {
            if (typeof gm.getMemberIds === "function") return gm.getMemberIds(guildId) || [];
        } catch (e) {
            /* fall through */
        }
        try {
            if (typeof gm.getMembers === "function") {
                return (gm.getMembers(guildId) || [])
                    .map((m) => m?.userId || m?.user?.id)
                    .filter(Boolean);
            }
        } catch (e) {
            /* fall through */
        }
        return [];
    }

    safeMember(guildId, userId) {
        try {
            return this.stores.guildMember?.getMember?.(guildId, userId) || null;
        } catch (e) {
            return null;
        }
    }

    // Discord has moved guild roles between stores across builds: newer clients
    // expose GuildRoleStore.getRoles(guildId), some expose GuildStore.getRoles(),
    // older ones keep them on the guild record itself. Try each in turn, since
    // reading only guild.roles silently yields no roles on a build that moved
    // them — which collapses every member into the ungrouped bucket.
    // Returns a lookup function so every store shape is handled identically
    // downstream, and records which source answered. Some builds also expose
    // only a per-role getter with no way to enumerate the full map, hence the
    // second pass.
    roleResolver(guildId) {
        this.roleSource = "none";
        this.roleCount = 0;
        this.hoistedCount = 0;
        if (!guildId) return () => null;

        const bulkSources = [
            ["GuildRoleStore.getRoles", () => this.stores.guildRole?.getRoles?.(guildId)],
            ["GuildStore.getRoles", () => this.stores.guild?.getRoles?.(guildId)],
            ["guild.roles", () => this.stores.guild?.getGuild?.(guildId)?.roles],
        ];
        for (const [name, fn] of bulkSources) {
            try {
                const roles = fn();
                if (roles && Object.keys(roles).length) {
                    this.roleSource = name;
                    this.roleCount = Object.keys(roles).length;
                    this.hoistedCount = Object.values(roles).filter((r) => r?.hoist).length;
                    return (roleId) => roles[roleId] || null;
                }
            } catch (e) {
                /* try the next source */
            }
        }

        // No enumerable map anywhere — fall back to per-role getters.
        const singleSources = [
            ["GuildRoleStore.getRole", this.stores.guildRole?.getRole, this.stores.guildRole],
            ["GuildStore.getRole", this.stores.guild?.getRole, this.stores.guild],
        ];
        for (const [name, getter, store] of singleSources) {
            if (typeof getter !== "function") continue;
            this.roleSource = name;
            this.roleCount = -1; // not enumerable through this path
            this.hoistedCount = -1;
            return (roleId) => {
                try {
                    return getter.call(store, guildId, roleId) || null;
                } catch (e) {
                    return null;
                }
            };
        }

        return () => null;
    }

    // Mirrors how Discord groups the member list: by the member's highest
    // hoisted role. Members with no hoisted role fall into "Online".
    groupFromMember(member, lookupRole) {
        const fallback = { name: "Online", position: -1 };
        if (!member) return fallback;
        let best = null;
        for (const roleId of member.roles || []) {
            const role = lookupRole(roleId);
            if (role?.hoist && (!best || role.position > best.position)) best = role;
        }
        return best ? { name: best.name, position: best.position } : fallback;
    }

    safeUser(userId) {
        try {
            return this.stores.user?.getUser?.(userId) || null;
        } catch (e) {
            return null;
        }
    }

    // Bots and system accounts are the ones Discord marks with an APP tag.
    // A user we cannot look up is treated as human: better to show someone
    // who should have been filtered than to silently drop a real person.
    isApp(user) {
        return !!(user?.bot || user?.system);
    }

    displayNameFor(userId, member, user) {
        try {
            if (member?.nick) return { name: member.nick, color: member.colorString || null };
            return {
                name: user?.globalName || user?.username || userId,
                color: member?.colorString || null,
            };
        } catch (e) {
            return { name: userId, color: null };
        }
    }

    avatarUrlFor(guildId, userId, user) {
        try {
            if (user?.getAvatarURL) {
                const url = user.getAvatarURL(guildId, 40);
                if (url) return url;
            }
            if (user?.avatar) {
                return `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.webp?size=40`;
            }
        } catch (e) {
            /* fall through to the default avatar */
        }
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }

    // Builds the grouped list of active members. Store data is the source of
    // truth; user ids scraped from rendered rows are folded in as a safety net
    // so this can never do worse than the old DOM-only approach.
    collectActiveMembers() {
        this.getStores();
        const guildId = this.currentGuildId();
        const storeIds = this.guildMemberIds(guildId);
        const domIds = this.resolveRows()
            .map((r) => r.userId)
            .filter(Boolean);

        const ids = Array.from(new Set([...storeIds, ...domIds]));
        const lookupRole = this.roleResolver(guildId);
        const byGroup = new Map();
        let total = 0;
        let withRecord = 0;
        let withRoleIds = 0;
        let botsExcluded = 0;

        for (const id of ids) {
            const activity = this.activityInfoForUser(id);
            if (!activity) continue;

            const user = this.safeUser(id);
            if (this.isApp(user)) {
                botsExcluded++;
                continue;
            }

            const member = this.safeMember(guildId, id);
            if (member) withRecord++;
            if (member?.roles?.length) withRoleIds++;
            const group = this.groupFromMember(member, lookupRole);
            const { name, color } = this.displayNameFor(id, member, user);
            const entry = { id, name, color, activity, avatar: this.avatarUrlFor(guildId, id, user) };

            if (!byGroup.has(group.name)) {
                byGroup.set(group.name, { name: group.name, position: group.position, members: [] });
            }
            byGroup.get(group.name).members.push(entry);
            total++;
        }

        // Higher role position sorts first, matching Discord's own ordering;
        // the ungrouped "Online" bucket (position -1) lands last.
        const groups = Array.from(byGroup.values()).sort((a, b) => b.position - a.position);
        for (const g of groups) g.members.sort((a, b) => a.name.localeCompare(b.name));

        this.lastCollection = {
            guildId,
            storeIds: storeIds.length,
            domIds: domIds.length,
            considered: ids.length,
            total,
            groups,
            roleSource: this.roleSource || "none",
            rolesFound: this.roleCount,
            hoistedRoles: this.hoistedCount,
            activeWithMemberRecord: withRecord,
            activeWithRoleIds: withRoleIds,
            botsExcluded,
        };
        return this.lastCollection;
    }

    // --------------------------------------------------------------- sidebar

    tick() {
        try {
            this.lastError = null;

            if (!this.button || !document.body.contains(this.button)) this.mountButton();

            const layerOpen = this.isLayerOpen();
            this.button.style.display = layerOpen ? "none" : "flex";
            if (this.panel) this.panel.style.display = layerOpen ? "none" : "block";
            if (layerOpen) return;

            const sidebar = this.resolveSidebar();
            if (sidebar !== this.sidebar) {
                this.sidebar = sidebar;
                if (sidebar) this.log(`member sidebar acquired via "${this.sidebarStrategy}"`, sidebar);
            }

            this.positionButton();
            this.updateButtonLabel();

            if (this.active && this.sidebar) this.applyFilter();
            else if (this.active) this.removePanel(); // sidebar went away
        } catch (e) {
            this.lastError = e;
            console.error("[ActiveMembersFilter] tick failed:", e);
        }
    }

    // A layer only counts as "open" if something in it actually covers the app.
    // Measure the CHILDREN, not the container: Discord's layerContainer is
    // itself a permanently present, full-viewport fixed overlay, so measuring
    // the container marks every tooltip and popout as a fullscreen modal and
    // hides the button forever.
    isLayerOpen() {
        const viewport = window.innerWidth * window.innerHeight;
        if (!viewport) return false;
        for (const container of document.querySelectorAll('[class*="layerContainer"]')) {
            for (const child of container.children) {
                const r = child.getBoundingClientRect();
                if ((r.width * r.height) / viewport > 0.4) return true;
            }
        }
        return false;
    }

    // --------------------------------------------------------------- sidebar

    isPlausibleSidebar(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 150 || r.width > 460 || r.height < 200) return false;
        return el.querySelectorAll('img[src*="/avatars/"], [class*="avatar"]').length >= 2;
    }

    // Class-based lookups first (cheap, and they survive odd window geometry),
    // geometry last. Every candidate still has to pass isPlausibleSidebar().
    get sidebarStrategies() {
        return [
            [
                "membersWrap class",
                () => Array.from(document.querySelectorAll('[class*="membersWrap"]')),
            ],
            ["members_ class", () => Array.from(document.querySelectorAll('div[class*="members_"]'))],
            ["role=list", () => Array.from(document.querySelectorAll('[role="list"]'))],
            ["geometry", () => this.findSidebarByGeometry()],
        ];
    }

    resolveSidebar() {
        const stats = {};
        let winner = null;
        for (const [name, fn] of this.sidebarStrategies) {
            let candidates = [];
            try {
                candidates = fn() || [];
            } catch (e) {
                candidates = [];
            }
            const good = candidates.filter((el) => this.isPlausibleSidebar(el));
            stats[name] = `${good.length}/${candidates.length}`;
            if (!winner && good.length) winner = { name, el: good[0] };
        }
        this.sidebarStats = stats;
        this.sidebarStrategy = winner?.name || null;
        return winner?.el || null;
    }

    // Original approach: a tall, narrow column flush against the right edge of
    // the window, containing several avatar images.
    findSidebarByGeometry() {
        const out = [];
        for (const el of document.querySelectorAll("div")) {
            const rect = el.getBoundingClientRect();
            if (
                rect.width > 180 &&
                rect.width < 420 &&
                rect.height > 250 &&
                Math.abs(rect.right - window.innerWidth) < 8 &&
                rect.left > window.innerWidth * 0.55
            ) {
                out.push(el);
            }
        }
        return out;
    }

    // Back-compat shim.
    findMemberSidebar() {
        return this.resolveSidebar();
    }

    // ------------------------------------------------------- row resolution

    // A real user avatar URL is /avatars/<snowflake>/<hash>. Default avatars
    // are /embed/avatars/<0-5>.png, which also contain "/avatars/" but carry
    // no user id — the digit-length check separates them.
    userIdFromAvatar(img) {
        const src = img.getAttribute("src") || "";
        // Server-specific avatar: /guilds/<guildId>/users/<userId>/avatars/<hash>.
        // Must be tested first — it also contains "/avatars/", but followed by
        // the hash rather than the id.
        const guildAvatar = /\/guilds\/\d+\/users\/(\d{16,21})\//.exec(src);
        if (guildAvatar) return guildAvatar[1];
        // Normal avatar: /avatars/<userId>/<hash>. Default avatars are
        // /embed/avatars/<0-5>.png and carry no id at all.
        const m = /\/avatars\/(\d{16,21})\//.exec(src);
        return m ? m[1] : null;
    }

    // Legacy strategy, kept only as a last resort. Walks up from the avatar
    // looking for something row-shaped. This is what broke: with skipped
    // (unpainted) rows the heights it measures are meaningless.
    geometryWalk(avatar) {
        let el = avatar;
        for (let i = 0; i < 8 && el.parentElement; i++) {
            el = el.parentElement;
            const rect = el.getBoundingClientRect();
            if (rect.height >= 26 && rect.height <= 76 && rect.width > 120) return el;
        }
        return null;
    }

    // Ordered best-first. Each maps an avatar <img> to its row element.
    // The first three are structural/semantic and do not measure anything,
    // so they are immune to content-visibility, transforms and virtualization.
    get rowStrategies() {
        return [
            ["data-list-item-id", (a) => a.closest("[data-list-item-id]")],
            ["role=listitem", (a) => a.closest('[role="listitem"]')],
            [
                "member__ class",
                (a) => a.closest('[class*="member__"], [class*="memberInner"], [class*="member_"]'),
            ],
            ["geometry walk", (a) => this.geometryWalk(a)],
        ];
    }

    // Tries each strategy against every avatar and keeps the first one that
    // resolves at least half of them. Any candidate that wraps more than one
    // avatar is rejected outright — that is how the whole-list scroll
    // container gets filtered out without needing to know its height.
    resolveRows() {
        if (!this.sidebar) {
            this.strategyStats = { total: 0 };
            this.rowStrategy = null;
            this.lastRows = [];
            return [];
        }

        const avatars = Array.from(this.sidebar.querySelectorAll('img[src*="/avatars/"]'));
        const stats = { total: avatars.length };
        let winner = null;

        for (const [name, fn] of this.rowStrategies) {
            const found = new Map(); // row element -> avatar
            for (const avatar of avatars) {
                let el = null;
                try {
                    el = fn(avatar);
                } catch (e) {
                    // Unsupported selector in this Electron build; skip strategy.
                    break;
                }
                if (!el || el === this.sidebar || found.has(el)) continue;
                if (el.querySelectorAll('img[src*="/avatars/"]').length > 1) continue;
                found.set(el, avatar);
            }
            stats[name] = found.size;
            if (!winner && avatars.length > 0 && found.size >= Math.ceil(avatars.length / 2)) {
                winner = { name, found };
            }
        }

        this.strategyStats = stats;
        this.rowStrategy = winner?.name || null;

        const rows = winner
            ? Array.from(winner.found, ([el, avatar]) => ({
                  el,
                  avatar,
                  userId: this.userIdFromAvatar(avatar),
              }))
            : [];

        this.maybeFixContentVisibility(rows);
        this.lastRows = rows;
        return rows;
    }

    maybeFixContentVisibility(rows) {
        if (this.cvOverrideActive || !rows.length) return;
        const skipped = rows.some((r) => {
            const cv = getComputedStyle(r.el).contentVisibility;
            return cv === "auto" || cv === "hidden";
        });
        if (skipped) this.enableContentVisibilityOverride();
    }

    // Back-compat shim: earlier versions of this plugin exposed bare elements.
    getMemberRows() {
        return this.resolveRows().map((r) => r.el);
    }

    // ------------------------------------------------------------ filtering

    // Prefers PresenceStore. Falls back to reading the row's text, using
    // textContent rather than innerText: innerText is layout-aware and
    // returns "" for rows the browser has skipped rendering.
    rowIsActive(row) {
        const fromStore = this.activityForUser(row.userId);
        if (fromStore) return fromStore.active;
        const text = row.el.textContent || "";
        return /Playing |Listening to|Streaming|Watching |Competing in/i.test(text);
    }

    applyFilter() {
        if (!this.active) {
            this.removePanel();
            return;
        }

        const data = this.collectActiveMembers();

        // Rebuilding the DOM every tick would reset scroll position and flicker,
        // so only re-render when the membership or their activities change.
        const signature = JSON.stringify([
            data.guildId,
            data.groups.map((g) => [g.name, g.members.map((m) => `${m.id}:${m.activity.label}`)]),
        ]);

        if (!this.panel || !document.body.contains(this.panel)) {
            this.buildPanel();
            this.panelSignature = null;
        }
        if (signature !== this.panelSignature) {
            this.renderPanel(data);
            this.panelSignature = signature;
            this.log(`panel rendered: ${data.total} active of ${data.considered} known members`);
        }
        this.positionPanel();
    }

    // Discord's own "open profile" action. Resolved once and cached, since a
    // failed Webpack search is not cheap.
    profileOpener() {
        if (this._profileOpener !== undefined) return this._profileOpener;
        this._profileOpener = null;
        try {
            const W = window.BdApi?.Webpack;
            const mod =
                W?.getByKeys?.("openUserProfileModal") ||
                W?.getModule?.((m) => m?.openUserProfileModal);
            if (typeof mod?.openUserProfileModal === "function") {
                this._profileOpener = (args) => mod.openUserProfileModal(args);
            }
        } catch (e) {
            this.log("profile opener lookup failed", e);
        }
        this.log(`profile opener resolved: ${!!this._profileOpener}`);
        return this._profileOpener;
    }

    openProfile(userId) {
        if (!userId) return false;
        const guildId = this.currentGuildId();

        const open = this.profileOpener();
        if (open) {
            try {
                open({ userId, guildId });
                return true;
            } catch (e) {
                this.log("openUserProfileModal failed", e);
            }
        }

        // Fallback: click Discord's own row for this member, when it happens to
        // be one of the rendered ones.
        const row = (this.lastRows || []).find((r) => r.userId === userId);
        if (row?.el) {
            row.el.dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
            );
            return true;
        }
        return false;
    }

    buildPanel() {
        this.removePanel();
        const panel = document.createElement("div");
        panel.className = "amf-panel";
        document.body.appendChild(panel);
        this.panel = panel;
    }

    removePanel() {
        document.querySelectorAll(".amf-panel").forEach((el) => el.remove());
        this.panel = null;
        this.panelSignature = null;
    }

    positionPanel() {
        if (!this.panel || !this.sidebar) return;
        const r = this.sidebar.getBoundingClientRect();
        this.panel.style.top = `${r.top}px`;
        this.panel.style.left = `${r.left}px`;
        this.panel.style.width = `${r.width}px`;
        this.panel.style.height = `${r.height}px`;
        // Only the floating fallback overlaps the panel and needs clearing.
        this.panel.style.paddingTop = this.buttonHome === "floating" ? "46px" : "8px";
    }

    renderPanel(data) {
        const panel = this.panel;
        if (!panel) return;
        panel.textContent = "";

        const head = document.createElement("div");
        head.className = "amf-panel-head";
        head.textContent = `ACTIVE — ${data.total}`;
        panel.appendChild(head);

        if (!data.total) {
            const empty = document.createElement("div");
            empty.className = "amf-empty";
            empty.textContent = data.considered
                ? "Nobody here is playing, streaming, listening or watching right now."
                : "No members loaded yet. Scroll the member list once, then try again.";
            panel.appendChild(empty);
            return;
        }

        for (const group of data.groups) {
            // The header is created alongside its members, so a group with
            // nobody in it can never produce a stray heading.
            const groupHead = document.createElement("div");
            groupHead.className = "amf-group-head";
            groupHead.textContent = `${group.name} — ${group.members.length}`;
            panel.appendChild(groupHead);

            for (const member of group.members) {
                const row = document.createElement("div");
                row.className = "amf-member";
                row.setAttribute("role", "button");
                row.setAttribute("tabindex", "0");
                row.title = `${member.name} — ${member.activity.label}`;
                row.addEventListener("click", () => this.openProfile(member.id));
                row.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        this.openProfile(member.id);
                    }
                });

                const img = document.createElement("img");
                img.className = "amf-avatar";
                img.src = member.avatar;
                img.alt = "";
                row.appendChild(img);

                const text = document.createElement("div");
                text.className = "amf-member-text";

                // Names and activity strings are user-controlled, so they are
                // set as text. Never innerHTML here.
                const name = document.createElement("div");
                name.className = "amf-name";
                name.textContent = member.name;
                if (member.color) name.style.color = member.color;

                const activity = document.createElement("div");
                activity.className = "amf-activity";
                activity.textContent = member.activity.label;

                text.appendChild(name);
                text.appendChild(activity);
                row.appendChild(text);
                panel.appendChild(row);
            }
        }
    }

    showAll() {
        document
            .querySelectorAll(".amf-hidden-row")
            .forEach((el) => el.classList.remove("amf-hidden-row"));
        this.removePanel();
    }

    // --------------------------------------------------------------- button

    // Discord's channel-header toolbar: the row of icons at top right holding
    // threads, notifications, pinned messages, member list and search. Matched
    // by position rather than by its hashed class name.
    findToolbar() {
        for (const el of document.querySelectorAll('[class*="toolbar"]')) {
            const r = el.getBoundingClientRect();
            if (
                r.height > 16 &&
                r.height < 60 &&
                r.top < 80 &&
                r.right > window.innerWidth * 0.4 &&
                el.children.length >= 2
            ) {
                return el;
            }
        }
        return null;
    }

    // Built with createElementNS rather than innerHTML so the plugin never
    // parses markup at runtime.
    buildIcon() {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "currentColor");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(NS, "path");
        path.setAttribute(
            "d",
            "M7.5 6h9a5.5 5.5 0 0 1 5.44 4.72l.86 6A3.5 3.5 0 0 1 19.34 21a3.5 3.5 0 0 1-2.9-1.55L15.2 17.6a1.5 1.5 0 0 0-1.25-.67h-3.9a1.5 1.5 0 0 0-1.25.67l-1.24 1.85A3.5 3.5 0 0 1 4.66 21a3.5 3.5 0 0 1-3.46-4.28l.86-6A5.5 5.5 0 0 1 7.5 6Zm-.25 3.5v1.75H5.5v1.5h1.75v1.75h1.5v-1.75h1.75v-1.5H8.75V9.5h-1.5ZM15.5 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2.5 2.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        );
        svg.appendChild(path);
        return svg;
    }

    mountButton() {
        document.querySelectorAll(".amf-toggle-btn").forEach((el) => el.remove());
        const btn = document.createElement("div");
        btn.className = "amf-toggle-btn";
        btn.setAttribute("role", "button");
        btn.setAttribute("tabindex", "0");
        btn.appendChild(this.buildIcon());

        const label = document.createElement("span");
        label.className = "amf-label";
        btn.appendChild(label);
        this.buttonLabel = label;

        btn.addEventListener("click", () => {
            if (!this.sidebar) {
                // Nothing to filter yet — show why, rather than doing nothing.
                this.dumpDebugInfo();
                return;
            }
            this.active = !this.active;
            btn.classList.toggle("amf-active", this.active);
            if (!this.active) this.showAll();
            this.updateButtonLabel();
            this.applyFilter();
        });
        btn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.dumpDebugInfo();
        });

        // Sit in Discord's own toolbar when we can find it; fall back to a
        // floating pill so the control is never simply absent.
        const toolbar = this.findToolbar();
        if (toolbar) {
            btn.classList.add("amf-in-toolbar");
            toolbar.insertBefore(btn, toolbar.firstChild);
            this.buttonHome = "toolbar";
        } else {
            btn.classList.add("amf-floating");
            document.body.appendChild(btn);
            this.buttonHome = "floating";
        }

        this.button = btn;
        this.updateButtonLabel();
        this.positionButton();
        this.log(`button mounted (${this.buttonHome})`);
    }

    updateButtonLabel() {
        if (!this.button) return;
        if (!this.sidebar) {
            if (this.buttonLabel) this.buttonLabel.textContent = "No member list";
            this.button.title =
                "Active only — member list not detected. Open it with the people icon, or click for debug info.";
            this.button.classList.add("amf-idle");
            this.button.classList.remove("amf-active");
            return;
        }
        this.button.classList.remove("amf-idle");
        if (this.buttonLabel) {
            this.buttonLabel.textContent = this.active ? "Showing Active Only" : "Show Active Only";
        }
        this.button.title = this.active
            ? "Showing active members only. Click to show everyone. Right-click for debug info."
            : "Show active members only. Right-click for debug info.";
    }

    // Only meaningful in the floating fallback; in the toolbar the button is
    // laid out by Discord like any other icon there.
    positionButton() {
        if (!this.button || this.buttonHome !== "floating") return;
        if (!this.sidebar) {
            this.button.style.left = "";
            this.button.style.right = "20px";
            this.button.style.top = "90px";
            return;
        }
        const rect = this.sidebar.getBoundingClientRect();
        this.button.style.right = "auto";
        this.button.style.top = `${Math.max(rect.top + 8, 8)}px`;
        this.button.style.left = `${Math.max(rect.left + (rect.width - this.button.offsetWidth) / 2, 8)}px`;
    }

    // ---------------------------------------------------------------- debug

    describe(el, label) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const cls = (el.className || "").toString().slice(0, 44);
        return (
            `${label} <${el.tagName.toLowerCase()}> h=${r.height.toFixed(0)} w=${r.width.toFixed(0)} ` +
            `cv=${cs.contentVisibility} cis=${cs.containIntrinsicSize} pos=${cs.position} ` +
            `disp=${cs.display} tf=${cs.transform.slice(0, 24)}\n    class="${cls}" ` +
            `listId="${(el.getAttribute("data-list-item-id") || "").slice(0, 40)}" role="${el.getAttribute("role") || ""}"`
        );
    }

    dumpDebugInfo() {
        const lines = [];
        const push = (s = "") => lines.push(s);

        push("ACTIVE FRIENDS FILTER — DEBUG");
        push("=============================");
        push(`window: ${window.innerWidth}x${window.innerHeight}  dpr=${window.devicePixelRatio}`);
        push(`button mounted: ${!!this.button && document.body.contains(this.button)} (${this.buttonHome || "unmounted"})`);
        push(`profile opener resolved: ${!!this.profileOpener()}`);
        push(`layer considered open (button hidden): ${this.isLayerOpen()}`);
        push(`last tick error: ${this.lastError ? this.lastError.message : "none"}`);
        push("");

        const { presence } = this.getStores();
        push(`BdApi.Webpack available: ${!!window.BdApi?.Webpack}`);
        for (const [name, ok] of Object.entries(this.storeReport())) {
            push(`  ${ok ? "OK  " : "MISS"} ${name}`);
        }
        if (presence) push(`  presence.getActivities is fn: ${typeof presence.getActivities === "function"}`);
        push("");

        const sidebar = this.resolveSidebar();
        this.sidebar = sidebar;
        push("--- SIDEBAR STRATEGY SCOREBOARD (plausible/candidates) ---");
        for (const [name] of this.sidebarStrategies) {
            const mark = name === this.sidebarStrategy ? "  <== USING" : "";
            push(`  ${name.padEnd(20)} ${this.sidebarStats[name]}${mark}`);
        }
        push(`Sidebar found: ${!!sidebar}`);

        if (!sidebar) {
            push("");
            push("Nothing passed the sidebar test (150-460px wide, >200px tall, >=2 avatars).");
            push(`Total avatars anywhere in document: ${document.querySelectorAll('img[src*="/avatars/"]').length}`);
            push("Right-aligned panels currently on screen:");
            let count = 0;
            document.querySelectorAll("div").forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (Math.abs(rect.right - window.innerWidth) < 8 && rect.height > 200 && count < 15) {
                    count++;
                    push(
                        `  #${count} w=${rect.width.toFixed(0)} h=${rect.height.toFixed(0)} left=${rect.left.toFixed(0)} imgs=${el.querySelectorAll("img").length} class="${(el.className || "").toString().slice(0, 60)}"`
                    );
                }
            });
            if (count === 0) push("  (none — is the member list open? people icon, top right)");
            this.showDebugPanel(lines.join("\n"));
            return;
        }

        const rect = sidebar.getBoundingClientRect();
        push(`Sidebar rect: w=${rect.width.toFixed(0)} h=${rect.height.toFixed(0)} left=${rect.left.toFixed(0)}`);
        push(`Sidebar class: ${(sidebar.className || "").toString().slice(0, 80)}`);
        push("");

        // --- which row strategy works -------------------------------------
        const rows = this.resolveRows();
        push("--- ROW STRATEGY SCOREBOARD ---");
        push(`Avatars in sidebar: ${this.strategyStats.total}`);
        for (const [name] of this.rowStrategies) {
            const hits = this.strategyStats[name];
            const mark = name === this.rowStrategy ? "  <== USING" : "";
            push(`  ${name.padEnd(20)} resolved ${hits === undefined ? "n/a" : hits}${mark}`);
        }
        push(`content-visibility override injected: ${this.cvOverrideActive}`);
        push("");

        // Coverage check. Discord's role group headers read "Minion — 10", so
        // summing them gives the number of members the list *claims* to hold.
        // If that is well above the number of rows actually in the DOM, the
        // list is virtualized and the missing members were never rendered —
        // no amount of CSS hiding can reveal something that does not exist.
        push("--- COVERAGE ---");
        const declared = ((sidebar.textContent || "").match(/—\s*\d+/g) || []).reduce(
            (n, s) => n + parseInt(s.replace(/\D/g, ""), 10),
            0
        );
        const missingId = rows.filter((r) => !r.userId).length;
        push(`Members declared by group headers: ${declared}`);
        push(`Avatars in sidebar:                ${this.strategyStats.total}`);
        push(`Rows resolved:                     ${rows.length}`);
        push(`Rows with no parsable user id:     ${missingId}`);
        if (declared > rows.length) {
            push("→ VIRTUALIZED: members beyond the rendered window are absent from");
            push("  the DOM entirely. Filtering can only ever affect what is rendered.");
        }
        if (missingId > 0) {
            push("→ Some rows yielded no user id (server-specific or default avatars),");
            push("  so those fall back to text scraping instead of PresenceStore.");
        }
        push("");

        // What the rendered panel actually works from — independent of the DOM.
        const collection = this.collectActiveMembers();
        push("--- OWN LIST (what the panel renders) ---");
        push(`Guild id:                     ${collection.guildId || "none"}`);
        push(`Member ids from stores:       ${collection.storeIds}`);
        push(`Member ids from rendered DOM: ${collection.domIds}`);
        push(`Unique members considered:    ${collection.considered}`);
        push(`Active members found:         ${collection.total}`);
        push(`Bots/apps excluded:           ${collection.botsExcluded}`);
        push(`Role source:                  ${collection.roleSource}`);
        push(
            `Roles in guild:               ${
                collection.rolesFound < 0 ? "not enumerable" : collection.rolesFound
            } (${collection.hoistedRoles < 0 ? "?" : collection.hoistedRoles} hoisted)`
        );
        push(`Active with a member record:  ${collection.activeWithMemberRecord}/${collection.total}`);
        push(`Active with role ids on it:   ${collection.activeWithRoleIds}/${collection.total}`);
        if (collection.roleSource === "none") {
            push("→ No role data from any store: grouping cannot work and everyone");
            push("  falls into the ungrouped bucket. This is a bug, report it.");
        } else if (collection.activeWithMemberRecord < collection.total) {
            push("→ Some active members have no loaded member record, so their roles");
            push("  are unknown and they fall into the ungrouped bucket.");
        } else if (collection.activeWithRoleIds === 0) {
            push("→ Member records exist but carry no role ids, so there is nothing");
            push("  to group by. The member record shape has changed; report it.");
        } else if (collection.hoistedRoles === 0) {
            push('→ Roles resolved but none are hoisted ("Display separately" off),');
            push("  so a single ungrouped list is CORRECT for this server.");
        }
        collection.groups.forEach((g) => {
            push(`  ${g.name} — ${g.members.length}`);
            g.members.forEach((m) => push(`      ${m.name}: ${m.activity.label}`));
        });
        if (!collection.storeIds) {
            push("→ Stores returned no members, so the panel is falling back to the");
            push("  rendered DOM only, which is subject to virtualization.");
        }
        push("");

        if (!rows.length) {
            push("No strategy resolved at least half the avatars. Dumping the raw");
            push("ancestor chain of the first avatar so the structure is visible:");
            const first = sidebar.querySelector('img[src*="/avatars/"]');
            let el = first;
            for (let i = 0; i < 10 && el?.parentElement; i++) {
                el = el.parentElement;
                push("  " + this.describe(el, `[${i}]`));
            }
            this.showDebugPanel(lines.join("\n"));
            return;
        }

        // --- anatomy of the first resolved row ----------------------------
        const sample = rows[0];
        push("--- FIRST ROW ANATOMY ---");
        push(this.describe(sample.el, "row  "));
        push(`  innerText="${(sample.el.innerText || "").replace(/\n/g, " | ").slice(0, 60)}"`);
        push(`  textContent="${(sample.el.textContent || "").replace(/\n/g, " | ").slice(0, 60)}"`);
        push("  ^ if innerText is empty but textContent is not, the row is unpainted");
        push("");

        const parent = sample.el.parentElement;
        if (parent) push(this.describe(parent, "parent"));

        // Siblings — Discord sometimes splits hit-target and visual content
        // into parallel siblings rather than nesting them.
        const prev = sample.el.previousElementSibling;
        const next = sample.el.nextElementSibling;
        push(prev ? this.describe(prev, "prev sib") : "prev sib: (none)");
        push(next ? this.describe(next, "next sib") : "next sib: (none)");
        push(`row child count: ${sample.el.children.length}`);
        Array.from(sample.el.children)
            .slice(0, 4)
            .forEach((c, i) => push("  " + this.describe(c, `child[${i}]`)));
        push("");

        // --- per-row detection results ------------------------------------
        push("--- ROWS (store activity vs. scraped text) ---");
        rows.slice(0, 30).forEach((row, i) => {
            const h = row.el.getBoundingClientRect().height.toFixed(0);
            const store = this.activityForUser(row.userId);
            const friend = this.isFriend(row.userId);
            const txt = (row.el.textContent || "").replace(/\n/g, " | ").slice(0, 34);
            push(
                `#${String(i).padStart(2)} h=${String(h).padStart(3)} id=${row.userId || "?"} ` +
                    `friend=${friend === null ? "?" : friend} active=${this.rowIsActive(row)}`
            );
            push(`     store="${store ? store.label || "(none)" : "STORE UNAVAILABLE"}" text="${txt}"`);
        });
        push("");

        // --- conclusions ---------------------------------------------------
        push("--- READ THIS ---");
        const anyActive = rows.some((r) => this.rowIsActive(r));
        if (!presence) {
            push("• PresenceStore did NOT resolve. Activity detection is falling back to");
            push("  scraping text, which is language-dependent and misses unpainted rows.");
        } else {
            push("• PresenceStore resolved — activity is read from Discord's own state,");
            push("  independent of what the row rendered or the client language.");
        }
        if (this.rowStrategy && this.rowStrategy !== "geometry walk") {
            push(`• Rows are resolved structurally via "${this.rowStrategy}" — no heights measured,`);
            push("  so content-visibility / virtualization can no longer break detection.");
        } else if (this.rowStrategy === "geometry walk") {
            push("• Falling back to the old geometry walk. Send me this dump; the structural");
            push("  selectors above need adjusting for your Discord build.");
        }
        if (!anyActive) {
            push("• No row is currently active. Confirm with a friend visibly in-game,");
            push("  otherwise an empty filter result is correct, not a bug.");
        }
        const anyAbsolute = rows.some((r) => getComputedStyle(r.el).position === "absolute");
        if (anyAbsolute) {
            push("• Rows are position:absolute — hiding them will leave gaps rather than");
            push("  compacting the list. Tell me and I'll add transform re-stacking.");
        }

        this.showDebugPanel(lines.join("\n"));
    }

    showDebugPanel(text) {
        document.querySelector(".amf-debug-panel")?.remove();
        const panel = document.createElement("div");
        panel.className = "amf-debug-panel";

        const toolbar = document.createElement("div");
        toolbar.className = "amf-debug-toolbar";

        // No DevTools console here, so make the dump easy to paste elsewhere.
        const copyBtn = document.createElement("div");
        copyBtn.innerText = "📋 Copy";
        copyBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(text);
                copyBtn.innerText = "✓ Copied";
            } catch (e) {
                copyBtn.innerText = "✗ Failed";
            }
            setTimeout(() => (copyBtn.innerText = "📋 Copy"), 1500);
        });

        const closeBtn = document.createElement("div");
        closeBtn.innerText = "✕ Close";
        closeBtn.addEventListener("click", () => panel.remove());

        toolbar.appendChild(copyBtn);
        toolbar.appendChild(closeBtn);
        panel.appendChild(toolbar);

        const body = document.createElement("div");
        body.innerText = text;
        panel.appendChild(body);

        document.body.appendChild(panel);
    }
};

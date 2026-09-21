const test = require("node:test");
const assert = require("node:assert/strict");

const ActiveMembersFilter = require("../ActiveMembersFilter.plugin.js");

const loadWith = (saved) => {
    global.window = { BdApi: { Data: { load: () => saved } } };
    const plugin = new ActiveMembersFilter();
    plugin.loadSettings();
    return plugin;
};

test("safe browser and utility defaults are excluded", () => {
    const plugin = new ActiveMembersFilter();
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Firefox" }), true);
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Borderless Gaming" }), true);
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Everything" }), false);
});

test("selection and custom exclusions use case-insensitive exact names", () => {
    const plugin = new ActiveMembersFilter();
    plugin.settings.excludedApps = ["Firefox"];
    plugin.settings.customExcludedApps = ["My Background App"];

    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "firefox" }), true);
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "MY BACKGROUND APP" }), true);
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Firefox Nightly" }), false);
    assert.equal(plugin.isHiddenKnownApp({ type: 1, name: "Firefox" }), false);
});

test("version 1.3 category choices migrate to individual selections", () => {
    const plugin = loadWith({ hideKnownBrowsers: false, hideKnownUtilityApps: true });

    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Chrome" }), false);
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Wallpaper Engine" }), true);
    assert.equal("hideKnownBrowsers" in plugin.settings, false);
    assert.equal("hideKnownUtilityApps" in plugin.settings, false);
});

test("version 1.2 combined choice migrates without enabling exclusions", () => {
    const plugin = loadWith({ hideKnownApps: false });

    assert.deepEqual(plugin.settings.excludedApps, []);
    assert.equal(plugin.isHiddenKnownApp({ type: 0, name: "Chrome" }), false);
    assert.equal("hideKnownApps" in plugin.settings, false);
});

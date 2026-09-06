# Copies the plugin into the local BetterDiscord plugins folder.
# BetterDiscord hot-reloads on file change; if it doesn't, toggle the
# plugin off and on under Settings -> Plugins.

$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "ActiveFriendsFilter.plugin.js"
$target = Join-Path $env:APPDATA "BetterDiscord\plugins"

if (-not (Test-Path $source)) { throw "Plugin file not found at $source" }
if (-not (Test-Path $target)) { throw "BetterDiscord plugins folder not found at $target" }

Copy-Item $source $target -Force
Write-Host "Installed to $target" -ForegroundColor Green

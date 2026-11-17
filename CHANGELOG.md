# Changelog

## 1.2.1

- Consent hardening: `/function <need>` now prints the full proposal as a visible session message before the confirmation dialog, and the dialog lists the packages to enable.
- Assembly never executes the requirement: after approval the text is placed back in the editor (press Enter to start); cancellation changes nothing.
- Docs: installing into a running session requires `/reload` or restart; otherwise `/function ...` reaches the model as a normal prompt.

## 1.2.0

- Renamed the extension to **Pi-function**; `/pi-function` added as an alias of `/function`.
- Always-on: reloads at every session start and starts a filesystem watcher for new packages, extensions, and skills.
- Auto-accept: new plugins and skills are classified immediately (curated map, signal words, then keyword scoring).
- Added known-package mapping, scenario hints, and a resident/infrastructure bucket.
- Catalog now shows MCP as resident, lists auto-assigned skills, and reports unclassified items separately.
- Fixed scoped-package matching (for example `@scope/pi-pretty`) and the MCP-only scenario rendering.

## 1.1.0

- Automatic classification for newly installed plugins and skills.
- Skills are listed per scenario.
- `/function assign` accepts `infra`.
- Branding assets and repository packaging.

## 1.0.0

- First working version: 22 scenarios, catalog, approval gate, tool assembly, store under `~/.pi/agent/function-menu.json`.

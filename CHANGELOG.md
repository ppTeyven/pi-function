# Changelog

## 1.4.1

- Scenario picker rows now show skill counts and representative skill names alongside plugin counts, for example `data · 日志 / 性能 / 数据分析 — 2 个插件 · 3 技能（ctx-doctor、ctx-stats、ctx-upgrade）`; GSD skills are grouped as `GSD N`.
- The catalog header now shows the total number of discovered skills, and each scenario lists its skill count explicitly.

## 1.4.0

- Added three capability-driven scenarios: `gsd` (spec/plan/execute/verify/ship), `frontend` (pages, components, styling, visual acceptance), and `docs` (README, wiki, handoff).
- Re-mapped scenarios against the installed 24-package set: pi-lens and subagents are now used for understand/bugfix/review/research/audit; `cc-safety-net` stays infrastructure instead of being offered as a scenario plugin.
- Fixed package ids: `@juicesharp/rpiv-todo` replaces the unqualified `rpiv-todo`; removed the duplicate `PLUGIN_INFO` key.
- Core tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) are always kept active, including after `/function off`, so pi-pretty's disabled grep/find/ls no longer disappear.
- Privacy scenario no longer forces the MCP adapter; MCP remains resident in other scenarios.
- Classifier v3 reclassifies auto-assigned entries, moves all `gsd-*` skills into `gsd`, removes stale local entries, and preserves manual overrides.
- GSD skills and large auto-assigned groups are summarized as counts instead of flooding the catalog/proposal.
- Availability audit now reports `ok` / `warn` / `inactive` / `absent` with config-aware warnings for pi-lens, browser-loop, vision, GSD on Windows, and the advisor.
- Added zero-dependency `test.mjs` and npm `test` script.
- Fixed skill discovery: reads `SKILL.md` from agent/project/GSD/package roots when `pi.getCommands()` has not registered skill commands yet, and normalizes `skill:` prefixes.

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

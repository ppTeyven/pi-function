# Changelog

## 2.3.0

- Restored workflow bundles after feedback that workflows *are* plugin/skill packages; the problem was the binding quality, not the bundling itself.
- Each workflow now binds process-capability roles with intentional overlap (for example debug and review-gate share code intelligence and verification).
- Hydration caps each workflow at 8 packages and 8 skills, picks one package per role, and applies generic allow/deny patterns so research/search, document-conversion, and knowledge-connector skills do not leak into execution workflows.
- Workflow packages and skills are merged with the selected application scenario; workflow-only mode now enables the workflow bundle instead of preserving an arbitrary tool set.
- Workflow picker rows show bundle plugin/skill counts; proposals mark workflow-only packages and skills.
- Added regression tests for coherent bundles and intentional overlap; `/function` remains 32 application scenarios × 10 workflows.

## 2.2.0

- Workflows are now **process-only**: they no longer own or activate plugin/skill bundles. The same workflow works with any application scenario, and scenario capabilities are identical across workflows.
- Added process steps, checkpoints, and done criteria to every workflow; the picker explains the process instead of showing plugin counts.
- Added `research`, `debug`, and `iterate` workflows; `maintain` now recommends `debug`, `report` recommends `research`.
- Workflow-only mode (`/function workflow`) now preserves the current tool set and injects only the process, instead of enabling workflow-specific packages.
- Removed `WORKFLOW_CAPABILITIES`, workflow plugin hydration, and workflow package unions from proposals, diagnostics, and tool activation.
- Updated tests to assert workflows bundle no plugins and all workflows resolve the same scenario capability set.

## 2.1.2

- Workflow picker rows now explain **when to choose each workflow**, not just the title and plugin count.
- Rewrote workflow `when`/`brief` text in plain language and updated both README workflow tables.
- Made `README.md` fully English, including picker examples, scenario tables, workflow tables, and dynamic-need examples.

## 2.1.1

- Added `/function workflow`: shows only the workflow picker, enables the selected workflow, and does not bind a task scenario.
- `/function status` and session restore now understand workflow-only mode; the workflow brief is injected without a task section.
- Added a regression test ensuring workflow mode never opens the task picker.
- Added a step-by-step user guide to both READMEs: first run, entry points, picker labels, day-to-day commands, and troubleshooting.

## 2.1.0

- Expanded application scenarios from 17 to 32: email, social posts, novels/stories, video/podcast, music/lyrics, posters/covers, courses, resumes, events, ecommerce, dashboards, spreadsheets, legal documents, small tools/CLI, and AI chatbots.
- Added capability mappings and classification hints for the new IDs; dashboards and commerce resolve visual/data capabilities, images resolve vision/design, spreadsheets resolve data/tooling, and chatbots resolve web/MCP/memory.
- Added workflow recommendations for the new scenarios and removed ambiguous keywords (`海报`, `报表`, `dashboard`) from the older `design`/`data` scenarios.
- Tests and both READMEs now cover the 32 fixed application IDs.

## 2.0.0

- Scenarios are now **application/output types** instead of engineering activities: `article`, `report`, `presentation`, `docs`, `webpage`, `webapp`, `mobile`, `game`, `design`, `data`, `api`, `automation`, `integration`, `plugin`, `maintain`, `localization`, `general`.
- Workflows are now output-agnostic: `direct`, `outline`, `prototype`, `parallel`, `review-gate`, `phased`, `offline`.
- Added per-user capability profiles. On first load and every scan, installed packages, tools, commands, and skills are scored into generic capability roles and hydrated into the fixed scenario/workflow IDs. The profile is stored at `~/.pi/agent/function-menu.profile.json` and rebuilt when its fingerprint changes.
- Removed hardcoded plugin/skill inventories from the source and README. The same scenario ID resolves to different tools on different machines.
- `analyzeNeed` now composes from the capability profile, including multi-intent requests such as “做网页并写文章”.
- `classifyItem`, `isInfraId`, `scenarioPackages`, `scenarioSkillIds`, `buildCatalog`, `buildProposal`, and `auditPackages` are profile-driven; package-specific special cases were removed.
- Picker/debug output shows hydrated plugin and skill counts; `/function status` reports the active workflow × application scenario.
- Added tests with synthetic capability profiles, cross-machine ID resolution, dynamic multi-intent analysis, core-tool retention, and the two-step flow.

## 1.6.0

- `/function "<need>"` no longer force-fits one task scenario. It performs multi-label analysis over all task signals, then composes plugins and skills from capability descriptions, including needs that match no fixed scenario.
- Free-text mode now asks only for a workflow; the fixed task picker is reserved for bare `/function`. Task ids passed as arguments are treated as needs, not shortcuts.
- Dynamic scenarios show per-item reasons and confidence in the proposal; selected skills are listed with their descriptions.
- A dynamic combination is recorded as `id: "custom"` with the need, selected packages/skills, and detected task signals, and is restored with the session.
- Privacy detection suppresses network packages in dynamic mode; MCP is only added when the need explicitly mentions MCP/integration.
- `suggest_scenario` now returns a dynamic composition even when no fixed task matches.
- Tests cover multi-intent analysis, no-match fallback, single workflow picker for free text, custom-entry persistence, and dynamic proposals.

## 1.5.0

- Added a workflow-first, task-second flow. `/function` now asks for an execution workflow (`direct`, `plan-first`, `test-first`, `fanout`, `review-gate`, `phased`) before the task scenario.
- `/function <need>` ranks the task, asks for a workflow, then lets the user choose the task with ranked matches first, instead of auto-assembling the top match.
- Workflow and task packages are merged; duplicate packages are shown once and marked as workflow additions in the proposal.
- `activeWorkflow` is recorded with the scenario, restored with the session, included in `before_agent_start`, and shown in `/function status`.
- Privacy scenarios ignore workflow plugins, so `privacy × fanout` cannot introduce network/subagent capabilities.
- `suggest_scenario` now reports a recommended workflow alongside task candidates.
- README (English and Chinese), tests, and package version updated.

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

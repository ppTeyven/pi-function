# Changelog

## 2.20.0

- **Cross-language aliases.** `ALIASES` (~55 bidirectional pairs: `watermark ↔ 水印`, `thumbnail ↔ 缩略图`, `scrape ↔ 抓取`, `darkmode ↔ 深色模式`, …). `catalogTexts()` now exposes `scan` (flattened text + the other-language forms) and `wordAudit`, `capabilityScan`, `capabilityCovered` all match against it, so a Chinese request matches an English skill description and vice versa. The table only widens matching: no score, no tags, no extra tokens.
- Lazy alias initialisation (`aliasPairs()`) — the lexicon tables sit above `norm`/`flatText` in the file, and eager evaluation hit TDZ at import time.
- Unmatched words are asked about up to **3** per run (was 2) and `pending` reports the remainder; the whole set is also injected into the system prompt (`### 逐词核对` with 对得上 / 动作风格 / 本机没提到 lines), so nothing is recorded and then forgotten.
- New `tests/coverage.test.mjs` (8 cases). Total 208.

## 2.19.0

- **Completeness invariant.** `wordAudit` now keeps a per-token ledger (`byToken`) and derives its buckets from it, so `accounted === total` and `sum(counts) === total` hold for any input. Previously three things could vanish: single characters (excluded from both matching and questions), `generic` words (recorded as "seen" only) and unmatched words past the top 5.
- Buckets are now explicit: `matched / generic / unmatched / filler / single / deed`, each with a count; `pending` reports how many unmatched words were not asked this turn but are still recorded.
- `filler` words are recorded instead of dropped. Trimming to an empty string (`我把`) now lands in `filler` rather than falling back to the raw token and polluting `unmatched`.
- Single-character actions: `SINGLE_DEEDS = { 画: design, 剪: video, 译: i18n, 唱: audio }`, matched by the lexicon scan only — deliberately **not** merged into `TAG_VOCAB`, where a one-character substring would pull in `动画 / 规划 / 漫画`.
- Proposal wording: `拆出 N 个词，全部有归属：命中 a / 通用 b / 没提到 c / 虚词 d / 单字 e / 动作风格 f`, plus `另有 k 个没提到的词本轮不问，但已记录在核对结果里`.
- New `tests/complete.test.mjs` (9 cases) asserts the invariant over numbers, English, full-width punctuation and empty input. Total 200.

## 2.18.0

- **Verbs and adjectives are requirements too.** `ACTION_ROLES` (润色/精简/校对/摘要/翻译/抓取/调度/备份/部署/去重/合并/可视化/剪辑/转码/渲染/重构/调试/审查/审计/监控…) and `STYLE_ROLES` (极简/简洁/干净/高级/精致/优雅/可爱/复古/科技感/商务/小清新/扁平/拟物/正式/口语/幽默/克制/专业) are matched against the **raw request text**, without segmentation, so they cannot be filtered out by `GENERIC_TERMS` or mangled by the word splitter.
- Both tables are merged into `TAG_VOCAB`, so a verb or adjective also becomes a coverage `demand`: `做个极简风格的海报` now selects `design-system` through `demands: ["design"]`.
- `deedWords(need)` reports each hit with its part of speech and whether the mapped role has any installed member; the proposal shows `动作/风格：极简→设计 / 视觉（已覆盖）、剪辑→视频创作（本机没有）`.
- Uncovered deeds become gaps with `source: "deed"` and join the same ask → find-skill flow (`本机没有「剪辑（动作）」能力，要去找吗？`).
- `capabilityCovered` now looks at id + description only — tags say "what area this touches", not "what it can produce", so a writing skill mentioning 剪辑 no longer counts as video capability.
- `PROFILE_VERSION` 8 → 9 (tags changed). New `tests/deeds.test.mjs` (9 cases). Total 191.

## 2.17.0

- **Every word is checked.** `wordTokens()` segments the request with `Intl.Segmenter('zh', {granularity:'word'})` (falling back to 2–4 char windows), keeps ascii words and ascii/CJK runs (`AI味`), and merges runs of single-character segments while also keeping the prefix-trimmed form (`并转成二维码` → `并转成二维码` + `二维码`).
- `wordAudit(need, items)` classifies every word into `matched` (1…15% of items mention it), `generic` (>15%) or `unmatched` (**no item mentions it**), and reports the strongest item for each match. `analyzeNeed` returns it as `audit.words`; `dynamicScenario.brief` and the proposal both carry it (`**逐词核对（每个词都查过）**`).
- Unmatched words are **asked**, not judged unimportant: `unknownWordAsks()` → `「水印」要当成需求吗？`; 是 becomes a gap with `source: "word"` and joins the find-skill path, 否 drops it for the turn. Max 2 asks, deduped against bare-word asks and existing gaps.
- `AUDIT_STOP` + prefix/suffix trimming keep the questions on nouns (`水印`, `二维码`, `报告`) instead of `这份`, `加上`, `的`.
- `catalogTexts()` extracted so `capabilityScan` and `wordAudit` share one flattened catalog snapshot.
- New `tests/words.test.mjs` (9 cases). Total 182.

## 2.16.0

- The ask/apply logic of stage “full sweep” is now pure and exported, so it can be regression-tested without a UI: `auditAskList(scenario, max)` (what to ask, dedup against `auditPicks`), `includeAuditPicks(scenario, picked)` (skill → `skillIds`, plugin → `plugins`), `bareGapsFromAnswers(need, alreadyGaps, yesIds)` (answer 是 + nothing installed → gap).
- `askUnselectedItems` / `clarifyBareCapabilities` now call those helpers; behaviour unchanged, questions deduped.
- New `tests/two-problems.test.mjs`: 20 cases split evenly across the two reported issues — **installed but unused** (P1–P10: empty-demand coverage, humanizer reachable, sweep finds gated-out items, mutual exclusion, rarity filter, flattened matching, direction sensitivity, ask order, panel wording) and **bare words guessed** (P11–P20: video/audio/OCR asks, explicit phrasing not asked, no repeat asks, max 2, 是/否 outcomes, no gap before an answer, covered capability adds no gap, end-to-end confirm + hand-off to find-skill). Total 173.

## 2.15.0

- **Full sweep.** After role-based selection, `capabilityScan(need)` compares the request against every non-infra plugin and skill (name, description, tags, role labels). Whatever matched but was not selected is listed in the proposal and asked about one by one — never added silently, never dropped silently.
- Rarity filter instead of a stopword list: a term is only evidence when `1 <= df <= max(2, 15% of items)`. This catches `ai味`, `公文`, `爬虫` while ignoring `内容`, `处理`.
- Term extraction keeps ascii/CJK runs (`AI味`) and comparison is whitespace/punctuation-flat, so `去除 AI 味` matches `去AI味`.
- **Fixed silent under-use:** `selectByCoverage` returned an empty list when a request produced no demands (no scenario, no tag) — exactly the `去AI味` case, where `humanizer` was installed and correct but never selected. Candidates already passed the relevance gate, so they are now kept by score.
- `TAG_VOCAB` gains `ai味 / 人味 / 人话 / 去ai / 改写 → writing`; `PROFILE_VERSION` 7 → 8 (profile rebuild).
- **Bare words are asked.** `BARE_CAPABILITIES` (`video / audio / ocr`) asks `要真的做吗？` when only the bare word appears; `视频剪辑` is explicit and not asked. 是 with nothing installed becomes a gap and goes to find-skill.
- `comboSkillIds` now always merges `scenario.skillIds`, so items confirmed in the sweep also apply to static scenarios.
- New `tests/audit.test.mjs` (9 cases). Total 153.

## 2.14.0

- Capability gaps are now reported, not silently dropped. `NEED_CAPABILITIES` detects deliverables the request names but no installed item can produce (`pdf / slides / docx / xlsx / video / audio / ocr / imagegen`), and `capabilityGaps()` also surfaces contract `required` roles that resolve to no installed member. Direction is respected: a PDF→Markdown converter does not count as being able to generate a PDF.
- The proposal (`buildProposal`) gains a `**能力缺口（本机没有）**` section listing each gap, its hint and whether it came from the request or the scenario contract.
- Assembly asks once per gap — `本机没有「…」能力，要去找吗？` — instead of guessing:
  - yes → the request is routed to your own find-skill (`skill:skill-finder`, else `skill:find-skill-skillhub`, else plain text in the editor) with a fixed brief: confirm nothing local already does it, offer 2-3 candidates, install only after confirmation;
  - no → recorded as `declinedGaps`.
- Both outcomes are injected into the system prompt (`已征得同意去找` / `用户选择不找`), so the model either searches first or states the limit instead of pretending.
- New `tests/gaps.test.mjs` (9 cases). Total 144.

## 2.13.0

- Multi-select is now a single step: both pickers print the full option list and ask once for numbers (`1,3`) or ids (`debug,process`). The old "add another?" confirmation loop is gone.
- Cap stays at 3 picks; extra tokens are ignored.
- Menu picks no longer open a second dialog per item, so the flow is: sub-function → workflow(s) → scenario(s) → confirm.
- Tests updated to drive `ctx.ui.input`; legacy `test.mjs` flow migrated too. Total 135.

## 2.12.0

- Stage B: capability tags. `TAG_VOCAB` maps Chinese capability words (表格/图表/公文/爬虫/海报/翻译/…) to capability roles; every profile item now exposes `tags` (name + description + tools + commands + non-infra roles). `PROFILE_VERSION` bumped to 7 so profiles rebuild.
- Stage C: set-cover slot allocation. `selectByCoverage(candidates, limit, demands)` greedily covers the top scenario's required roles and the request's tags, counting a role match double, and **leaves leftover slots empty** instead of filling them by score.
- `analyzeNeed` now ends with coverage selection; infrastructure roles no longer appear in tags (they only set the `infra` flag).
- Effect on the fixture: average precision 1.000, 0.7 packages / 1.0 skills per need; `plugin`-style requests no longer lose `pi-lens` to a wiki plugin that merely mentions 代码.
- Tests: 11 tag/coverage cases. Total 135.

## 2.11.0

- Stage D upgraded to a real signal: the extension hooks Pi's `tool_call` event, maps the tool back to its owning package (by tool path, scoped packages included) and records counts per assembled scenario (`itemUse`).
- Bonus now weights actual usage highest: `min(1.2, 0.5·ln(1+called) + 0.1·ln(1+assembled) + 0.8 if manually assigned)`. Being picked but never called earns very little.
- `/function stats` lists real calls, assembly counts and manual assignments; `stats reset` clears all three. Counts flush to disk every 5 calls.
- Old Pi versions without `tool_call` still work (hook registration is wrapped).
- Tests: 3 more feedback cases (path→package mapping, hook registration/no-scenario guard, priority ordering). Total 124.

## 2.10.0

- Stage D usage feedback: every assembly records which packages/skills it enabled (`usage`), and `/function assign` records manual corrections (`manualAdds`). Both add a bounded bonus when scoring the same scenario again — `min(1.2, 0.25·ln(1+n) + 0.8 if assigned)`, deliberately below a name match (5 points).
- `/function stats` shows per-scenario assembly counts and manual assignments; `/function stats reset` clears them. Nothing leaves the machine.
- `loadStore` now persists `usage` / `manualAdds`, so feedback survives restarts.
- README: "Customizing for your domain" (scenario → contract → capability role → workflow, with verification steps) and the stage D bonus formula.
- Tests: +10 feedback cases (boost monotonicity/cap, per-scenario isolation, recordUsage, legacy store compatibility, stats/reset). Total 121.

## 2.9.0

- Scenario capability contracts: every scenario now declares `required / optional / forbidden`, and `auditCoverage()` reports `not-installed` vs `not-selected` gaps instead of silently under-allocating.
- Coverage backfill: when the top scenario's required capability has no member selected, the best member of that role is added (reason: `必需能力：…`).
- Relevance gates: role-scoped matching, generic-term filtering, longest-match-only scoring, virtual-word n-gram filtering, and per-intent/global budgets (5 packages, 5 skills).
- Multi-select: `/function debug+process` (also `,`), plus a looping picker (up to 3) for workflows and scenarios; combo records restore after restart.
- Follow-up questions: assembly preview and system prompt list 3–4 questions (deliverable / acceptance / boundaries / scope).
- New `docx` scenario and capability role for 公文/正式发文, so red-header formatting tasks are not captured by email/report.
- Fix: scan no longer marks known entries as missing when enumeration is incomplete; store writes are guarded.
- Tests: 111 cases across unit / integration / invariants / persistence / e2e / user journeys, with a repository fixture so they run on any machine (`npm test`).

## 2.6.0

- Bare `/function` now opens a sub-function picker first: scenario assembly, workflow-only, profile, scan, status, restore, or manual assignment.
- `/function` argument completion now includes `assemble` and descriptions for every sub-function.
- Existing direct subcommands remain unchanged.

## 2.5.0

- Stronger profile classification: weighted name/tool/command/skill/description signals, minimum score, role-level deny rules, and caps of 3 package roles / 2 skill roles.
- Fixed false positives: search skills no longer become testing/data capabilities; document-formatting skills no longer become design/docs; knowledge-base connectors no longer become generic memory; strong name matches (e.g. memory packages) override description denies.
- Added `/function profile` to inspect roles, scores, unassigned items, and the profile path.
- Added tests for noisy-description classification and profile-version rebuild.

## 2.4.0

- Merged `prototype` into `outline` (structure or minimum prototype first) and `iterate` into `review-gate` (review or feedback loop). Eight workflows: direct, outline, research, debug, parallel, review-gate, phased, offline.
- Kept `prototype` and `iterate` as restore aliases, so existing session records still resolve.
- Browser packages that require `KERNEL_API_KEY` are no longer bound when the key is absent; browser skills such as Playwright remain available.
- Bumped the profile fingerprint version so existing profiles rebuild automatically.
- README/CHANGELOG and tests updated; no hard-coded package assignments added.

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

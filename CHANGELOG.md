# Changelog

## 2.32.0

- **Needs are read as phrases, not as a word list.** `wordAudit()` now runs a 4→2-token window pass over consecutive tokens whose individual buckets are `unmatched`/`single`/`generic`; if the joined string (`flatText(win.join(""))`) appears in the catalog, the whole window is marked `compound` and recorded as `{ phrase, item, kind, size }`. "重新安排组合" is one intent pointing at one item, instead of three orphan words. The completeness invariant still holds (`accounted === total`, new `counts.compound`).
- **Asks are per-phrase.** `unknownWordAsks()` prefers `unmatchedPhrases` (contiguous unmatched runs, `id: phrase:<p>`, "这整件事是你要做的吗？") and only falls back to `word:<term>` when no phrase can be formed; `wordGapsFromAnswers()` accepts both, so a "yes" turns into one capability gap instead of N.
- Panel gains **组合理解（相邻的词连起来看，不拆开）** and the audit section is retitled 逐词核对（每个词都有归属）; the injected prompt now starts with 需求理解（先组合，再看每个词）.
- `tests/phrase.test.mjs` G1–G5 (compound rescue on generic words, invariant, one ask per phrase, phrase gap, fallback). Total 262.

## 2.31.0

- **The number→id mapping now lives inside the input dialog.** pi-web draws extension requests as a floating card whose position the extension cannot control, so on a 9-row workflow list it covered the last two rows. The placeholder now carries the whole legend (`1=direct 2=outline … 9=offline`), which means the covered rows are still readable where you type.
- Titles shortened (`选工作流`, not `选工作流（可多选，推荐的在第 1 个）`) — the message already appends `（可多选，最多 N 个）`, and a long title wraps the card taller, eating more of the list.
- R7 asserts the placeholder contains both the first and the last id and that the dialog title stays short. Total 257.

## 2.30.0

- **The scan also runs at startup, and it speaks.** `session_start` now calls `scan()` with the UI notifier instead of `scan(false)`: new plugins/skills, entries migrated off dead scenario ids, and packages that gained abilities are all reported on boot, before the first `/function`.
- **`/function status` shows the last scan:** time, how many entries were new, and how many were migrated or gained abilities — so a silent boot scan can still be audited later.
- Tests R5/R6 cover the startup path (new skill discovered + notified, dead id migrated on boot). Total 256.

## 2.29.0

- **Dead scenario ids are migrated, not left dangling.** `SCENARIOS` has been reworked over time (release/research/webui/tests/audit/gsd/... are gone), but the store kept those strings: on this machine **66 of 186 entries** pointed at ids no scenario could ever match, so `/function assemble` silently skipped them. `LEGACY_SCENARIO_MAP` pulls each old id to its current equivalent (release→maintain, webui→webapp, gsd→process, i18n→localization, …); an id that is neither current nor in the map becomes `null` (unclassified) instead of an unrecognised string.
- **The migration now runs even when the classifier has no answer.** The old code only wrote a reclassification when `classifyItem()` returned a scenario, so an entry whose keywords stopped matching kept its dead id forever. It now falls through to the map, then to null.
- **Manual assignments are still untouchable:** `overrides` and `auto: false` entries are skipped by the migration (test M5).
- `CLASSIFIER_VERSION` 5 → 6, so the migration runs once on the next `/function`.
- `tests/migration.test.mjs`: six cases — hit, map fallback, unknown → null, valid untouched, override untouched, whole table ends valid. Total 254.

## 2.28.0

- **Every `/function` call rescans the catalog first** — not just `scan`/`assemble`. Newly installed plugins and skills are discovered, classified and made available for *this* assembly instead of waiting for a `/reload` or a manual `/function scan`. The scan runs once at the top of the handler, so all sub-functions inherit it.
- **New abilities inside an already-installed plugin count too.** `reconcile()` now compares each known item's skills/tools with the live discovery and reports the difference (union-merge, so an incomplete enumeration never deletes anything). A package that ships a new skill after an update is surfaced just like a brand-new install.
- **The check is reported, and only when it finds something:** `function: 新发现 N 个插件/技能，已归类：…；M 个已装条目新增能力：…；都已进入本次可选项`. Silent when nothing changed.
- **Fixed: the no-argument menu threw `Assignment to constant variable`** when you picked a subcommand — `const args` was reassigned in the menu branch. Now `let args`.
- `tests/refresh.test.mjs` covers discovery of a new skill, new skills/tools on known items, the scan-on-`status` guarantee, and the menu dispatch regression. Total 248.

## 2.27.0

- **An assembly now survives `/reload`.** `applyScenario()` writes `store.active = { id, workflow, at, tools, custom }` to disk, so the record is not tied to process memory. `restoreScenario()` falls back to it whenever the session branch has no `function-scenario` entry — the branch is empty after a reload that did not replay entries, which is exactly when the old code gave up.
- **Recovery does not wait for `session_start`.** The first `before_agent_start` of a session runs `captureBaseline()` + `restoreScenario(ctx, true)` once (`restoreTried` latch), silently. If `session_start` already restored the branch entry, the fallback never fires.
- **Restoring is not "using" it again.** `applyScenario(..., { record: false })` skips `recordUsage()`, so a reload does not inflate the usage counters that feed ranking.
- `/function off` clears `store.active` and writes the `null` tombstone; otherwise the next start would resurrect an assembly the user just turned off.
- `tests/persist.test.mjs` covers the round trip: write → disk → first-turn restore → `off` clears. Total 244.

## 2.26.0

- **The wave now moves every 26px block, not whole letters.** `waveAt(col, t)` is driven by the pixel column (`phase = 2πt/period - col × 0.55`), and both renderers apply it per rect: a letter can have one cell at rest and the next one lifted six pixels. Combined with the 55% dimming on the crest, the wordmark reads as a surface passing through the glyphs rather than eight letters bobbing in unison.
- `columnOf(x)` maps a block's x to its column, so the GIF and the SVG share one definition of "which block is where in the wave".
- B4 now asserts the per-block behaviour it used to only imply: at least as many wave groups as rects, and at least two distinct phases inside a single letter. (First attempt asserted *all* delays unique and went red — blocks in the same column are supposed to share a phase.)
- Total 240.

## 2.25.0

- **Banner motion is now a travelling wave.** Each letter bobs six pixels and the crest dims to 55%, so the wordmark breathes instead of typing itself in. Nothing appears or disappears any more — the previous versions (per-column fade, then type-on with a caret) both made letters pop in and out, which is exactly what was asked to stop.
- **Letters are tighter:** the gap between two letters is one cell (26px) instead of two, so `function` reads as one word (inbox 536..1576 instead of 536..1758).
- **The GIF now loops seamlessly:** 2.6s at 25fps is exactly 65 frames of 40ms, and the dot pulse shares the same period, so the loop point is invisible.
- **README image URL is versioned** (`assets/banner.gif?v=2.25.0`). GitHub's camo cache is keyed by URL, so the clipped Pi mark people kept seeing was a stale copy of the 2.23.0 render; bumping the query string forces a refetch.
- `tests/banner.test.mjs`: B4 rewritten for the wave (and rejects the old `type`/`rise`/`caret` motion), B8 expects 26px gaps, B6 asserts 65 whole frames at 40ms (the GCE delay field is in centiseconds — comparing it to 40 was the bug that made B6 red), B10 now proves letters never vanish and the only grey is the wave's dimming.
- Total 240.

## 2.24.0

- **Banner motion redone: typing instead of a cross-fade.** The old entrance faded each column in independently, so half-transparent columns sat on top of the letters — which reads as something translucent sliding over the wordmark. Now the three Pi blocks land one after another, the wordmark types in whole letters with a blinking block caret, the dots breathe, and the letters untype right-to-left before the loop restarts. Nothing is ever drawn at partial opacity over text.
- **Fixed a 1px grey fringe on every stroke.** `TEXT_Y` was 169 (odd); the GIF's 2×2 box filter straddled every text edge and blended half a pixel of background into it (10,560 grey pixels measured). `TEXT_Y` is now 168, so all wordmark edges land on even coordinates and the raster is exactly two colours.
- `tests/banner.test.mjs` **B10** decodes the GIF's own LZW stream and asserts the wordmark band contains only pure white and background — a regression test for "no translucent overlay", which no amount of palette inspection would have caught. B4 now asserts the stepwise typing animation and that the old `rise`/`translateY` motion is gone. 10 cases.
- Total 240.

## 2.23.1

- **Fixed the Pi mark in the GIF: it was drawn at raw logo coordinates.** `PI_MARK.polygons` are the untouched 256-grid logo points; the SVG places them with `<g transform="translate(96,80) scale(0.45)">`, and the GIF renderer was rasterising them without that transform — so the mark rendered 2.2× too large, ran past the card's bottom edge (clipped), and crowded the wordmark. Now both renderers apply the transform exactly once.
- `scripts/banner-geometry.mjs` exposes `piPoints()` and `PI_BOX` so the placed mark is a shared, testable fact instead of a comment in two files; `tests/banner.test.mjs` **B9** asserts the mark stays inside the card with ≥24px margins, never reaches the wordmark's ink (`x1 < TEXT_X - 32`), keeps its 211px width, and that the SVG's `<g transform>` string still equals `PI_MARK.transform`.
- Total 239.

## 2.23.0

- **The README banner now actually animates on GitHub.** GitHub's sanitiser strips `<style>`, so the CSS animation in `banner.svg` only ever ran in a browser or editor — on the README the wordmark appeared static. The banner is now a GIF (`assets/banner.gif`, 927×260, 85 frames, ~290 KB) and the SVG stays as the crisp static/edit-time version.
- New `scripts/banner-geometry.mjs` holds the single source of truth (glyphs, `inkBox`, `layout()`, palette, `TIMING`); both renderers import it, and `banner.test.mjs` B8 fails if the two drift apart.
- New `scripts/render-banner-gif.mjs`: zero dependencies. It rasterises the same rectangles and writes GIF89a by hand (LZW, NETSCAPE loop, palette entries pre-mixed with the background so the fade needs no dithering), 2×2 box filter down to 927×260. Entrance is 25 fps across the full canvas; the breathing hold ships only a 34×10 patch per frame, which is what keeps the file small.
- `node scripts/render-banner-gif.mjs --png` dumps the first and settled frames for eyeballing. Both scripts are wired as `npm run render:banner` / `render:banner:gif`.
- `tests/banner.test.mjs` +3: GIF is real GIF89a with a loop extension and ≥40 frames, size stays under 1.5 MB, and geometry matches the SVG rect-for-rect.
- Total 238.

## 2.22.1

- Banner wordmark: letters are now laid out **by ink edge** instead of a fixed 6-cell advance, so all seven letter gaps are exactly 52px (2 cells). `function` used to read as `f  u  n c t  i o  n` because `f`/`t`/`i` sit off-centre in their cell.
- The banner is animated (pixels rise column by column, the three palette dots breathe) using CSS **inside** the SVG, written so that stripping `<style>` — which GitHub's README sanitiser does — leaves the full, correctly spaced wordmark. `npm run render:banner -- --static` renders the still version.
- `render-banner.mjs --preview` prints an ASCII proof of the spacing; `tests/banner.test.mjs` (5 cases) asserts equal gaps, no overlap, additive animation and untouched canvas/Pi mark.
- Total 235.

## 2.22.0

- **Removed the argument-completion feature.** `/function` no longer implements `getArgumentCompletions`, the `menu` pseudo-subcommand is gone, and the `/fn` alias is gone. Rationale: the web UI caches the candidate table per command name and does not refresh it on `/reload`, so any published list can go stale and steal Enter; publishing nothing makes the whole class of bug impossible. `/function` + Enter opens the subcommand menu, `/function <sub>` still works.
- Tests: `completions.test.mjs` now guards the *absence* of the feature (plus: no `/fn`, empty args open the menu).
- Total 232.

## 2.21.6

- Bare `/function` no longer offers completions (`getArgumentCompletions("")` → `null`), so **Enter runs the workflow × scenario menu**. The web UI caches that candidate table once per command name and does not refresh it on `/reload`, so any list we publish can go stale and steal the Enter key; publishing nothing makes that impossible. Prefixes (`/function s`) still list subcommands, and `menu` remains accepted.
- Total 232.

## 2.21.5

- `tests/applied.test.mjs`: 10 smoke tests that fail loudly if any change from this session is missing from the running code — installed copy byte-identical to the repo, version == package.json, capability gaps + find-skill wording, the "installed but unused" bug, empty-demand selection, bare words, word-audit completeness, verbs/adjectives, CN/EN aliases, scan classification + completion order + `/fn`.
- Total 232.

## 2.21.4

- New `/fn` shortcut: same handler as `/function`, registered **without** `getArgumentCompletions`. The web UI keeps a stale argument-completion panel per command name, so `/fn` (a name it has never cached) goes straight to the workflow × scenario menu on Enter.
- Total 222.

## 2.21.3

- `/function status` now prints `扩展版本：vX.Y.Z`, and `EXT_VERSION` is exported. When a reload seems not to apply, this answers "which build is actually running?" in one command; a test keeps it equal to `package.json`.
- Total 221.

## 2.21.2

- `/function` argument completion: the first row is now `menu` ("直接使用 /function" = 工作流 × 场景菜单), so Tab/Enter lands on the menu instead of `assemble`. The literal empty-value row didn't survive the web UI's list rendering (the provider returns it, the renderer drops it), so an explicit subcommand is used instead.
- `menu` is handled exactly like no argument: `/function menu` opens the subcommand menu and is never treated as a requirement.
- `tests/completions.test.mjs` now 4 cases. Total 220.

## 2.21.1

- `/function` argument completion now puts the bare command first (`value: ""`), so Tab/Enter on an empty prefix uses plain `/function` and opens the workflow × scenario menu. Subcommands (`assemble / workflow / profile / scan / status / stats / off / assign`) keep their order after it; an empty entry is filtered out as soon as a prefix is typed.
- New `tests/completions.test.mjs` (3 cases). Total 219.

## 2.21.0

- **The catalog side now uses the same vocabulary as the request side.** `buildProfile` scores `expandItemText(...)` (text + `ALIASES` counterparts) and consults `tagRoleHits(...)` (nouns/verbs/adjectives → roles via `TAG_VOCAB`), so `/function scan` classifies a skill described as `Remove watermark from photos` into `vision` and one described only as `精简、校对` into `writing`.
- Two-tier evidence keeps precision: two or more distinct tag words is base evidence; a single word only reorders candidates, so `整体风格偏商务` cannot turn a skill into a design tool.
- `TAG_VOCAB` gains artifact nouns (`水印/照片/截图/缩略图 → vision`, `字幕/分镜 → video`, `播客/配音/音频 → audio`, `简历/合同/发票 → docx`) and `ALIASES` gains audio/video/data/docs pairs (`render/encode/trim/voiceover/transcribe`, `pivot/funnel/metric/cohort`, `glossary/footnote/citation/toc`).
- `/function scan` reports classification outcome: `未归类 m/N 个（用 /function assign …）：…` or `全部 N 个条目都归入了能力角色`. An item is never silently dropped — it either has a role or is listed as unassigned.
- `PROFILE_VERSION` 9 → 10 (vocabulary changed, cached profiles must rebuild).
- New `tests/scan.test.mjs` (8 cases). Total 216.

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

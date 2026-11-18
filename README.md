<div align="center">
  <img src="assets/banner.svg" alt="Pi-function" width="100%">

  <h1>Pi-function</h1>

  <p><strong>Application-scenario + workflow assembly for the Pi coding agent.</strong><br>
  Fixed scenario IDs. Per-user capability profile. Nothing runs until you approve.</p>

  <p>
    <a href="https://github.com/ppTeyven/pi-function/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ppTeyven/pi-function?style=flat-square&color=F1BE58"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/ppTeyven/pi-function?style=flat-square&color=4D9ABF"></a>
    <img alt="Pi extension" src="https://img.shields.io/badge/pi-extension-F09082?style=flat-square">
    <img alt="Node >= 20" src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white">
  </p>

  <p>
    <a href="#install">Install</a> ·
    <a href="#usage-guide">Usage guide</a> ·
    <a href="#scenarios">Scenarios</a> ·
    <a href="#workflows">Workflows</a> ·
    <a href="#per-user-profile">Profile</a> ·
    <a href="README.zh-CN.md">Chinese</a>
  </p>
</div>

---

Pi-function turns your installed Pi extensions into **application scenarios** — making a webpage, writing an article, building a game, creating a report, and so on. Bare `/function` asks **how** to work (workflow), then **what** to make (scenario). A free-text need skips the task picker and is analyzed across multiple application types.

The scenario and workflow IDs are stable for every user. Which plugins and skills fill those slots is **detected from the current machine** and stored in a per-user profile — the source code does not assume a particular package set.

It is a single file, always loaded, with no dependencies, no network calls, and no telemetry.

## Install

```bash
pi install git:github.com/ppTeyven/pi-function
```

Local development:

```bash
pi install ./path/to/pi-function
```

Or drop `function-menu.js` into `~/.pi/agent/extensions/`. Pi loads it at startup.

If you install it while a session is already running, run `/reload` or restart. Until then `/function ...` is a normal prompt and cannot be intercepted.

Requires Node 20+ and a Pi version supporting `pi.registerCommand`, `pi.setActiveTools`, and skills in `pi.getCommands()`.

## Usage guide

### First run

1. Install the extension, then run `/reload` (or restart Pi) so `/function` is recognized.
2. Run `/function`. It opens a sub-function picker first; choosing “assemble” prints the catalog.
3. **Choose a workflow** — how this run should proceed (outline/prototype, research, review gate, and so on). The workflow brings its own process bundle; the scenario adds domain capabilities.
4. **Choose an application scenario** — what you want to make (webpage, article, game, report, and so on).
5. Review the assembly proposal. Nothing changes until you approve it.
6. After assembly, describe the task. The extension never executes your request by itself.

If you only want an execution style, run `/function workflow`; it asks for a workflow, enables that bundle, and does not bind a task scenario.

### Commands

| Command | What happens |
|---|---|
| `/function` | Opens a sub-function picker first (assemble / workflow-only / profile / scan / status / restore / assign); assemble then prints the catalog, asks for a workflow and an application scenario, and assembles after approval |
| `/function workflow` | Asks only for a workflow, enables its bundle, and does not bind a task scenario |
| `/function <need>` | Analyzes the need across multiple application types, asks for a workflow, composes plugins/skills from the profile, and assembles after approval; never opens the fixed task picker and never executes the need |
| `/function profile` | Shows the generated capability profile: roles, scores, unassigned items, and profile path |
| `/function scan` | Re-scans installed packages, local extensions, and skills, then rebuilds the profile |
| `/function status` | Shows the active workflow × scenario (or workflow-only mode) and enabled plugin tools |
| `/function assign <name> <scenario-id\|none>` | Manually overrides one profile binding |
| `/function off` | Restores the tool set from before assembly |

`/pi-function` is an alias.

Workflow rows explain the process and show their bundle plugin/skill counts; scenario rows show domain plugin and skill counts. A typical fixed-menu exchange:

```text
/function

Step 1: choose a workflow (how to execute)
  outline · Outline first — ★ recommended · produce an outline, confirm it, then expand
  direct · Direct output — clear, small scope; act now without a separate plan
  ...

Step 2: choose an application scenario (what to make)
  webpage · Web page / landing page / site — 2 plugins · 3 skills (frontend-design, ...)
  ...

## Assembly: Outline first × Web page / landing page / site
**Workflow**: produce an outline/page list first, confirm it, then build
**Scenario**: marketing site, landing page, responsive page

**Plugins and capabilities to enable**
- ... — capability description, tools, commands, skills
...
```

### Which entry point should I use?

| Situation | Use | What happens |
|---|---|---|
| You want to browse the available combinations | `/function` | Workflow → application scenario → approve assembly |
| You want a workflow without a specific deliverable | `/function workflow` | Choose only a workflow; enable it without a task scenario |
| You already have a one-line request | `/function "build a product site and write a launch article"` | Analyze multiple application types → ask only for a workflow → approve the composition; the request goes back to the editor |

### Reading the picker

Each row looks roughly like this:

```text
webpage · Web page / landing page / site — 2 plugins · 3 skills (frontend-design, ...)
```

- The leading `webpage` is a stable scenario ID shared by every user.
- Plugins and skills come from the current machine's capability profile; another user may see different ones.
- The proposal lists the plugins, tools, skills, and any commands that still need to be run manually.
- Only **Yes** calls `setActiveTools`. **No** leaves everything untouched.

### Day-to-day commands

| Need | Command |
|---|---|
| See the active assembly | `/function status` |
| Inspect how plugins and skills were classified | `/function profile` |
| Restore the pre-assembly tool set | `/function off` |
| Pick up newly installed plugins/skills | `/function scan` |
| Correct one binding | `/function assign <package-or-skill> <scenario-id>`; use `none` to exclude it |
| See the full catalog again | `/function` |

### Troubleshooting

**`/function` is treated as a normal prompt.**

The current session has not loaded the extension. Run `/reload` or restart Pi.

**A newly installed plugin or skill is missing from the picker.**

Run `/function scan`. If it is still missing, verify that the package registers a tool/command or that the skill has a `SKILL.md`; then bind it with `/function assign`.

**The assembled tool set feels incomplete.**

Run `/function status` to inspect the active combination, choose a different workflow/scenario, or use `/function assign` to correct the profile binding.

**Will `/function "need"` start working on its own?**

No. It analyzes the need and waits for approval. After approval the need is placed back in the editor; press Enter to start it.

**Do multiple projects or sessions interfere?**

No. Assembly and `/reload` are scoped to the current Pi session.

## Scenarios

Scenarios are application/output types, not engineering activities.

| Group | IDs | What you are making |
|---|---|---|
| Content | `article` | Articles, copy, blogs, newsletters |
| Content | `email` | Emails, notifications, invitations, campaigns |
| Content | `social` | Social posts, threads, short-form copy |
| Content | `novel` | Fiction, stories, scripts, characters, worldbuilding |
| Content | `video` | Video scripts, podcasts, storyboards, subtitles |
| Content | `music` | Lyrics, song structure, scoring direction |
| Content | `course` | Courses, lessons, teaching material, training |
| Content | `resume` | Resumes, job search, interviews, portfolios |
| Content | `event` | Events, travel, weddings, life planning |
| Content | `report` | Reports, research, white papers, proposals |
| Content | `presentation` | Presentations, slide decks, pitches |
| Content | `docs` | Documentation, tutorials, knowledge bases, handoff |
| Content | `legal` | Contracts, terms, privacy policies, compliance notes |
| Product | `webpage` | Web pages, landing pages, marketing sites |
| Product | `webapp` | Web apps, admin dashboards, SaaS |
| Product | `commerce` | Ecommerce, product pages, storefronts, checkout |
| Product | `dashboard` | Dashboards, BI, reports, metric monitoring |
| Product | `mobile` | Apps, mini-programs, mobile experiences |
| Product | `game` | Games, interactive experiences, mini-games |
| Visual | `design` | Visual design, branding, UI mockups |
| Visual | `image` | Posters, covers, illustrations, assets |
| Visual | `data` | Data, charts, analysis results |
| Visual | `spreadsheet` | Spreadsheets, Excel, formulas, reconciliation |
| System | `api` | APIs, backends, CLIs, SDKs |
| System | `automation` | Automation, scraping, scheduled jobs |
| System | `tool` | Small tools, scripts, CLIs, format conversion |
| System | `integration` | Integrations, MCP, external systems |
| System | `chatbot` | AI chat, knowledge-base Q&A, support bots |
| System | `plugin` | Pi plugins, extensions, tools |
| Maintenance | `maintain` | Maintain existing projects, fix bugs, refactor, test |
| Maintenance | `localization` | Localization, translation, multilingual work |
| General | `general` | Everything else |

## Workflows

A workflow is a **process plus an execution bundle**. It binds generic capability roles (not hard-coded package names); your profile resolves those roles into the packages and skills installed on this machine. The application scenario then adds domain capabilities. Bundles may overlap: debug and review-gate both need code intelligence and verification, which is intentional.

| id | Workflow | Process | Bundle roles (resolved from your profile) | Use when |
|---|---|---|---|---|
| `direct` | Direct output | Read goal → produce → self-check | Core tools only | Clear, small scope; no separate plan |
| `outline` | Outline / prototype first | Clarify goal → outline or minimum artifact → confirm → expand | Plan review, task tracking, memory | You need a structure, outline, implementation plan, or a minimum prototype first |
| `research` | Evidence first | Questions → multiple sources → cross-check → cited conclusion | Web, repository knowledge, memory, docs | Facts are uncertain, sources must be compared, or claims need provenance |
| `debug` | Debug and fix | Reproduce → isolate root cause → minimal fix → regression | Code intelligence, verification, context, simplification | A clear failure, error, or abnormal behavior |
| `parallel` | Parallel exploration | Partition work → run in parallel → merge and dedupe → verify | Subagents, orchestration, task tracking | Independent slices or alternative solutions |
| `review-gate` | Review / iteration gate | Draft → independent review or feedback → fix key gaps → re-verify → deliver | Subagents, orchestration, code intelligence, verification, simplification, plan review | High-risk changes, pre-release checks, important documents, or feedback-driven polish |
| `phased` | Phased delivery | Spec → plan → staged execution → stage acceptance | Phase engine, plan review, task tracking, context | Multi-stage work, complex migrations, ongoing development |
| `offline` | Privacy / offline | Inventory local resources → stay offline → finish local work → list network gaps | Local memory only (no network capabilities) | Sensitive content, no external sharing, minimal network exposure |

> The table lists capability roles, not package names. Your profile resolves each role to the packages and skills actually installed on your machine; different users can get different bindings while the workflow IDs and semantics stay fixed.

## Per-user profile
On first load and on every scan, Pi-function reads the installed packages, extensions, tools, commands, and skills, scores them against generic capability roles, and writes:

```text
~/.pi/agent/function-menu.profile.json
```

The profile contains role → package/skill bindings, descriptions, and a fingerprint. When a new plugin or skill appears, the fingerprint changes and the profile is rebuilt automatically. The file is per-user and should not be committed.

The catalog and workflow bundles are hydrated from this profile at runtime. That is why the same `webpage` or `article` ID can use different tools on different machines without changing the extension source.

Manual overrides are stored in `~/.pi/agent/function-menu.json` and survive profile rebuilds.

### How items are organized
Pi-function deliberately avoids a hard-coded plugin list. Each package/skill is scored against capability roles using several independent signals:

- package or skill name: **5 points**;
- registered tool or command name: **3 points**;
- skill names contributed by a package: **2 points**;
- description terms: **1 point**.

A role must reach a minimum score (default **2**) before it is considered. Role-level `deny` rules then reject known false positives — for example, a search skill must not become a testing tool, and a document-formatting skill must not become a design tool. Strong name matches take precedence over description-based denies. Each item is capped at **3 package roles** or **2 skill roles**, keeping one package from polluting many scenarios. Packages that require an environment variable (such as a cloud browser key) are skipped when the variable is missing; their local skills remain available.

Run `/function profile` to inspect the result. The report shows every role, the matched packages/skills with scores, the unassigned list, and the profile file path. Manual corrections remain available through `/function assign`.

#### Classification uses the same vocabulary as the request side

`/function scan` rebuilds the profile. It used to score descriptions with the raw text only, so a skill that described itself in another language — or only through verbs and adjectives — ended up in the unassigned list even when the capability was obvious.

Both entry points now share one vocabulary:

```js
const text = expandItemText([name, label, description, tools, commands, skills].join(" "));
const tagHits = tagRoleHits(text);
```

- `expandItemText` appends the other-language forms from `ALIASES`, so `Remove watermark from photos` also scores against `水印 / 照片`.
- `tagRoleHits` counts nouns/verbs/adjectives per role via `TAG_VOCAB` (`润色 / 精简 / 校对 → writing`, `极简 / 干净 → design`, `去重 / 透视 → data`).
- Evidence is two-tier on purpose: **two or more** distinct words is base evidence and can establish a role; **one** word only boosts ordering, so `整体风格偏商务` cannot make a skill a design tool.

Because the profile is cached, the classifier version is bumped (`PROFILE_VERSION`) whenever the vocabulary changes — otherwise an old profile would keep the old classification forever.

`/function scan` now reports what it did with the catalog:

```
扫描完成：没有新插件/技能
未归类 2/29 个（用 /function assign <item> <scenario> 指定）：skill:foo、skill:bar
```

or `全部 29 个条目都归入了能力角色`. An item is never dropped: it either has a role or appears in the unassigned list (`tests/scan.test.mjs` asserts exactly that).

## Dynamic needs

`/function "build a product site and write a launch article"` does not choose one scenario. It:

1. detects multiple application signals (for example `webpage` + `article`);
2. collects matching capability roles, packages, and skills from the profile;
3. asks only for a workflow;
4. shows the composition and asks for approval.

If nothing matches, it still proposes a capability-based combination instead of refusing. The requirement is never sent automatically.

### When you have no capability for the need

Requests name deliverables the machine may simply not be able to produce (PDF, video, dubbing, OCR). Those words belong to no scenario, so silently dropping them is worse than a wrong tool — you would plan around a capability you do not have.

So assembly checks two things and reports them in the proposal:

1. **Need words** — `NEED_CAPABILITIES` maps `pdf / slides / docx / xlsx / video / audio / ocr / imagegen` to a detector for the request and a pattern for installed items. Direction matters: `markdown-converter` (PDF → Markdown) does **not** count as being able to produce a PDF.
2. **Contracts** — a `required` role with no installed member (`auditCoverage.missing`, `not-installed`).

```
**能力缺口（本机没有）**
- ⚠️ PDF 生成 / 转换 — 把内容排成 PDF（版式、字体、分页）（需求提到）：没有可用条目
- 装配前会问你：要不要用 find-skill 去找这些能力（是 / 否）
```

Then, per gap, assembly asks `本机没有「…」能力，要去找吗？`:

- **是** → the request is handed to your own find-skill (`skill:skill-finder`, or `skill:find-skill-skillhub` if that is what you have installed) as `/<cmd> 缺的能力：… 先确认本机现有技能/插件/命令行是否真的没有；没有就给出 2-3 个候选（各自覆盖哪部分、怎么装），等我确认再装。` Nothing is installed without your confirmation.
- **否** → the gap is recorded as `declinedGaps` and injected into the system prompt as `不要假装能做；先说明限制并给替代方案`.
- **是** is also injected as `已征得同意去找`, so the model runs the search before planning work it cannot finish.

No new network calls: the search goes through a skill that already exists locally.

### Full sweep: check every installed plugin and skill

Automatic selection runs behind a role gate (a request for PPT is not a request for a wiki plugin). A gate that is slightly too tight drops exactly the item you installed for this: `去AI味` matched no scenario, so `humanizer` scored nothing, and `selectByCoverage` with no demands returned an empty list — installed, correct, unused.

So after the role-based selection there is a second pass with no gate at all: `capabilityScan(need)` compares the request against **every** non-infra item's name, description, tags and role labels.

```
terms  = needTerms(need) + ascii/CJK runs ("AI味")          // "去除 AI 味" == "AI味"
df     = how many installed items contain the term
terms  = terms where 1 <= df <= max(2, 15% of items)         // "内容"/"处理" prove nothing
score  = termScoreDistinct(terms, item)
```

The rarity filter is what replaces a hand-tuned stopword list: a word every plugin writes (`内容`, `文件`) is dropped by counting, while a word only one plugin writes (`ai味`, `公文`) is strong evidence even at two characters.

Whatever matched but was **not** selected is shown and asked about — never added silently:

```
**全量核对（所有插件与技能）**
- 共核对 146 个条目：与需求相关 3 个；已选 0 个，未选 3 个
- 未选：`skill:humanizer` — 去除文本中的AI写作痕迹…（命中：ai味 / 文字）
- 装配前会逐个问你：要不要也启用            → 是 / 否（最多 3 个）
```

Answers of 是 land in `scenario.auditPicks`, `scenario.skillIds` / `scenario.plugins`, and in the system prompt as `全量核对后你确认一并启用的 … 这些是本机已有能力，直接用，不要再问“要不要装”`.

Also fixed on the way: `selectByCoverage` returned **nothing** when the request produced no demands (no scenario, no tags). Candidates had already passed the relevance gate, so dropping them was the silent under-use bug; it now keeps them by score.

### Bare capability words are asked, not guessed

`视频` alone does not say whether you want a video file or a shot list. So `BARE_CAPABILITIES` (`video / audio / ocr`) asks one question when only the bare word appears:

- `做一条视频` → `需求里提到「视频剪辑 / 合成」：要真的做吗？`
- `剪一条视频，加字幕` → no question (already explicit)
- **是** and nothing installed → becomes a gap, so find-skill is offered the same way as above.

General rule everywhere in this plugin: a word is either evidenced by the request, or it is a question — never an assumption.

### Every word is checked (`wordAudit`)

The rarity filter above decides what *counts as evidence*. It must not decide what *exists*. So the request is also split into words and each word is looked up in every installed item:

```js
wordTokens("帮我把这份报告加上水印并转成二维码")
  → 帮, 我把, 这份, 报告, 加上, 水印, 并转成二维码, 二维码, …
```

- `Intl.Segmenter('zh', {granularity: 'word'})` does the segmentation — real words, not n-gram shrapnel. Runs of one-character segments (`并 转 成 二 维 码`) are merged *and* kept in their prefix-trimmed form (`二维码`), so a word is never lost to a bad dictionary entry.
- Every word then lands in exactly one bucket:

| bucket | meaning | what happens |
|---|---|---|
| `matched` | 1 … 15% of items mention it | shown with the strongest item (`「ai味」→ skill:humanizer`) |
| `generic` | more than 15% of items mention it | known, but never used as evidence |
| `unmatched` | **no item mentions it** | shown, and **asked about** (max 2) |

```
**逐词核对（每个词都查过）**
- 拆出 8 个词：有对应条目 0 个、通用词 0 个、本机没提到 3 个
- 本机没提到：「二维码」、「报告」、「水印」（装配前会问你要不要去找）
```

`「水印」要当成需求吗？` → 是 turns it into a gap (`source: "word"`) and goes through the same find-skill path; 否 drops it for this turn. Function words are filtered by `AUDIT_STOP` plus prefix/suffix trimming (`把/并/转成/的/了`), so the questions stay about nouns you actually named.

#### Nothing is dropped silently (the completeness invariant)

An earlier version of this file could lose words three ways: single characters were excluded from matching *and* from questions, `generic` words were recorded only as "seen" and never used, and the unmatched list was truncated to six before being asked about. "Every word matters" is not something you can claim by inspection — it needs an invariant.

`wordAudit` now writes every token into a per-token ledger and derives the buckets from it:

```js
byToken.set(term, "matched" | "generic" | "unmatched" | "filler" | "single" | "deed")
accounted = byToken.size        // === total, always
counts    = tally by bucket     // sum(counts) === total, always
```

| bucket | what it means | asked? |
|---|---|---|
| `matched` | 1…15% of items mention it, with the strongest one | — (evidence) |
| `generic` | >15% mention it → cannot locate an item | no, but recorded |
| `unmatched` | no item mentions it | top 3; the rest stay in `pending` |
| `filler` | 虚词/量词 after prefix/suffix trimming | no, recorded |
| `single` | single CJK characters (never used as evidence) | no, recorded |
| `deed` | verb/adjective lexicon hit (incl. single-char `画/剪/译` via `SINGLE_DEEDS`) | via `source: "deed"` gaps |

The invariant is tested, not documented: `tests/complete.test.mjs` asserts `accounted === total` and `sum(counts) === total` over a corpus that includes numbers, English, full-width punctuation and empty input. Lose a word and the suite goes red.

Recorded is not the same as used, so the audit block also goes into the system prompt:

```
### 逐词核对（需求里每个词都查过）
对得上：水印→skill:watermark-remover、报告→skill:gongwenformat-pro
本机没提到：唢呐、竖琴、皮影、木雕、泥塑（另有 2 个已记录、本次未逐条问）
这些词如果确实要做，先向用户确认或找能力，不要默默忽略。
```

### Cross-language aliases (`ALIASES`)

Matching is string-based, so a Chinese request and an English skill description never meet: you install a skill that says `Remove watermark from photos`, you ask for `去水印`, and nothing matches. `ALIASES` closes that hole in both directions:

```js
watermark ↔ 水印     subtitle ↔ 字幕    thumbnail ↔ 缩略图   qrcode ↔ 二维码
translate ↔ 翻译      proofread ↔ 校对    summarize ↔ 摘要     refactor ↔ 重构
scrape ↔ 抓取         deploy ↔ 部署       dashboard ↔ 看板     darkmode ↔ 深色模式
… (~55 pairs)
```

- `catalogTexts()` exposes `scan` = flattened text **plus** the other-language forms, so one comparison covers both.
- `wordAudit`, `capabilityScan` and `capabilityCovered` all read `scan`, so `去水印` matches `watermark` and `remove the watermark` matches `水印`.
- The table only widens *matching*; it never adds score, never adds tags, never inserts tokens into the audit. A pair that does not exist in the table is simply not matched — which is why the table is data, not logic, and can be extended without touching code.

#### Verbs and adjectives count too

Nouns are the obvious half. `润色` and `极简` name a capability just as much as `海报` does, and they were being lost two ways: `GENERIC_TERMS` dropped every verb that appears in many descriptions (`生成`, `优化`), and the segmenter has no reason to treat a verb as important.

So `ACTION_ROLES` (verbs) and `STYLE_ROLES` (adjectives) are scanned **against the raw text** — no segmentation involved — and merged into `TAG_VOCAB`, which means they also become `demands` for coverage selection:

```
润色/精简/校对/摘要 → writing      极简/干净/高级/精致 → design
翻译/本地化         → i18n         正式                → docx
抓取/调度/备份/部署  → automation   可爱/复古/科技感    → design
去重/合并/可视化     → data         幽默/克制/口语      → writing
剪辑/转码/渲染       → video        扁平/拟物           → design
重构/调试/诊断       → code-intel
审查/审计           → plan-review
```

Each hit carries its part of speech, so the report is honest about what it saw:

```
- 动作/风格：极简→设计 / 视觉（已覆盖）、剪辑→视频创作（本机没有）
```

`（本机没有）` is a gap with `source: "deed"` — `剪辑` on a machine without any video capability asks `本机没有「剪辑（动作）」能力，要去找吗？` in the same flow as everything else. `（已覆盖）` is just evidence, already folded into selection through the tags.

## What assembly changes

- enables the selected plugin tools;
- keeps core tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) available;
- disables optional tools from other plugins;
- injects the workflow and scenario process into the system prompt;
- leaves plugin code loaded; it does not uninstall anything.

## Portability: what is guaranteed, what is not

This plugin never hardcodes plugin or skill names. It classifies whatever is installed into capability roles (`code-intel`, `writing`, `data`, `automation`, `process`, `docx`, …) and assembles by role, so a different plugin set still works — but "works" means "reports honestly", not "always perfect":

- **Adapts by itself**: the profile is rebuilt from your install on every start; items are matched by name, tool, command and description patterns. Unknown items land in `unassigned` and are still reachable by description matching.
- **Never silently under-allocates**: each scenario has a contract (`required / optional / forbidden`). If a required capability is missing you get `缺「数据 / 图表 / 分析」：当前没有可用条目`, and `/function` still lets you assemble with a warning.
- **Manual override always wins**: `/function assign <item> <scenario|none|infra>` and `/function scan` correct any misclassification.
- **What is *not* guaranteed**: keyword tables are tuned for Chinese office/dev tasks; a non-Chinese or very domain-specific workflow may need scenario keyword edits. Capability patterns target common naming; a plugin named nothing like its function needs `assign`.
- **No network calls, no writes outside the agent dir**: store and profile live in `~/.pi/agent/` (overridable with `PI_FUNCTION_STORE` / `PI_FUNCTION_PROFILE`, and `PI_CODING_AGENT_DIR` for the root).

## Customizing for your domain

Everything the assembler knows is data at the top of `function-menu.js` — no rebuild, no reinstall, just edit and `/reload`:

1. **Add or retarget a scenario** (`SCENARIOS`). `keywords` are what users type; `when`/`brief` are what the model reads.

```js
{
  id: "bioinfo", group: "专业", title: "生信分析 / 测序流程",
  when: "测序数据质控、比对、差异表达与结果图",
  keywords: ["测序", "生信", "fastq", "比对", "差异表达", "bioinformatics"],
  brief: "先确认物种与参考基因组，再定质控阈值；结果要能追溯到命令与版本。",
},
```

2. **Say what must be present** (`SCENARIO_CONTRACTS`). `required` is a hard gate — missing it prints 漏用 instead of silently assembling; `forbidden` keeps known noise out.

```js
bioinfo: { required: ["bio-data", "code-intel"], optional: ["data", "docs"], forbidden: ["slides"] },
```

3. **Define a capability role** (`CAPABILITIES`) so your plugins/skills land somewhere. Patterns are tested against name, tool names, commands and description.

```js
"bio-data": { label: "生信 / 组学数据", package: /bio|genom|bwa|samtools/i, skill: /bio|genom|fastq/i, terms: /测序|生信|基因组|差异表达/i },
```

4. **Bind roles to the scenario** (`SCENARIO_CAPABILITIES`) and, if it has a fixed run order, add a workflow (`WORKFLOWS` + `WORKFLOW_CAPABILITIES` + `WORKFLOW_SKILL_PATTERNS`).

Check your work:

```bash
npm test                                  # fixtures stay green
/function profile                          # which items landed in which role
/function "<your need>"                    # see the proposal, incl. coverage gaps
/function assign skill:your-skill bioinfo  # correct a misclassification; it also boosts future picks
```

## How slots are filled (stages B + C)

Selection is not "top N by score". Each item carries **capability tags** derived from its name, description, tools, commands and classification role; the need carries tags from the scenario keywords.

```js
TAG_VOCAB = { 表格: "data", 公文: "docx", 爬虫: "automation", 海报: "design", … }

selectByCoverage(candidates, limit, demands):
  demands = required roles of the top scenario + tags parsed from the request
  1. greedily pick the item covering the most uncovered demands
     (a role match counts double — a description that merely says "代码"
      does not make a wiki plugin a code-intelligence tool)
  2. slots left over when all demands are covered stay EMPTY
```

Why leave slots empty: an unused slot costs nothing; a wrong tool costs a wrong answer. Missing capability is reported by `auditCoverage` (`not-installed` / `not-selected`), so "fewer than 5" is a signal, not a bug.

Measured on the 14 representative needs in the fixture: average precision **1.000**, 0.7 packages and 1.0 skills per need (before stages B/C it was ~2.5 packages with precision 0.99).

## Learning from your own usage (stage D)

Every assembly records which items it put in (`usage` in `function-menu.json`), and `/function assign` records manual corrections (`manualAdds`). Both add a bounded bonus when scoring the same scenario again:

```
bonus = min(1.2,
            0.5 × ln(1 + times_actually_called)      // strongest signal
          + 0.1 × ln(1 + times_assembled)            // weak: picked but maybe never used
          + 0.8  if manually assigned)
```

Actual calls come from Pi's `tool_call` hook, mapped back to the owning package by its tool path. The cap is deliberately below a name match (5 points), so feedback nudges ordering and never overrides evidence. Inspect or clear it with `/function stats` / `/function stats reset`. Nothing leaves your machine; the counters live in the same local store.

## Development

```bash
npm test          # 235 cases, repository fixture — runs on any machine
```

Test layout (`tests/`, plan in `TEST-PLAN.md`):

| file | layer | cases |
|---|---|---|
| `contracts.test.mjs` | unit / config integrity | 29 |
| `allocation.test.mjs` | contracts, golden needs, invariants, persistence | 44 |
| `journeys.test.mjs` | real user requests (PPT deck, big project, vague one-liner…) | 29 |
| `feedback.test.mjs` | usage feedback: real tool calls, boost caps, stats/reset | 13 |
| `tags.test.mjs` | capability tags + set-cover selection | 11 |
| `gaps.test.mjs` | capability gaps, find-skill routing, ask flow | 9 |
| `audit.test.mjs` | full catalog sweep, bare-word asks, audit picks | 9 |
| `two-problems.test.mjs` | regression for the two reported issues: installed-but-unused, bare words guessed | 20 |
| `words.test.mjs` | word segmentation, per-word buckets, unmatched-word asks | 9 |
| `deeds.test.mjs` | verbs/adjectives → roles, deed gaps, panel wording | 9 |
| `complete.test.mjs` | completeness invariant: every token accounted for | 9 |
| `coverage.test.mjs` | bilingual aliases, scan text, pending words reach the prompt | 8 |
| `scan.test.mjs` | `/function scan` classification: aliases, tag evidence, unassigned reporting | 8 |
| `completions.test.mjs` | `/function` publishes no argument candidates (by design) | 4 |
| `banner.test.mjs` | banner spacing is uniform and the animation degrades safely | 5 |
| `applied.test.mjs` | every feature of this release is actually in the shipped file | 10 |
| `e2e.test.mjs` | command handler main + alternate flows | 9 |

Gates are quantified: required coverage 100%, forbidden hits 0, dynamic precision ≥ 0.80, budget ≤ 5 packages / 5 skills, determinism, read-only paths must not write the store, `analyzeNeed` < 20 ms.

Tests read `tests/fixtures/store.json` by default so results do not depend on what you have installed; set `PI_FUNCTION_REAL_STORE=1` to audit your own environment instead.

## License

MIT

<div align="center">
  <img src="assets/banner.svg" alt="Pi-function" width="100%">

  <h1>Pi-function</h1>

  <p><strong>Scenario-based tool assembly for the Pi coding agent.</strong><br>
  Always on. Shows you the plugins first. Acts only after you approve.</p>

  <p>
    <a href="https://github.com/ppTeyven/pi-function/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ppTeyven/pi-function?style=flat-square&color=F1BE58"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/ppTeyven/pi-function?style=flat-square&color=4D9ABF"></a>
    <img alt="Pi extension" src="https://img.shields.io/badge/pi-extension-F09082?style=flat-square">
    <img alt="Node >= 20" src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white">
  </p>

  <p>
    <a href="#install">Install</a> ·
    <a href="#usage">Usage</a> ·
    <a href="#scenarios">Scenarios</a> ·
    <a href="#how-assembly-works">How it works</a> ·
    <a href="#auto-accept">Auto-accept</a> ·
    <a href="README.zh-CN.md">中文</a>
  </p>
</div>

---

Pi-function turns a pile of installed Pi extensions into **25 task scenarios**. Instead of remembering which plugin to enable for which job, you describe the job — or open the menu — and Pi-function proposes the right set. Nothing is enabled until you press **yes**.

It is a single file, always loaded, with no dependencies, no network calls, and no telemetry.

## Why

Most agent extensions are useful only in the right context. A subagent fan-out helps a refactor and hurts a one-line typo. A plan reviewer is noise when you already know the fix. Enabling everything at once burns context and invites the wrong tool.

Pi-function keeps the catalog, matches your request, and gates the switch on your approval.

## Install

```bash
pi install git:github.com/ppTeyven/pi-function
```

Local development:

```bash
pi install ./path/to/pi-function
```

Or drop `function-menu.js` into `~/.pi/agent/extensions/`. Pi loads it at startup — **there is no enable step**.

If you install it while a Pi session is already running, that session will not see it until you run `/reload` or restart. Until then `/function ...` is a normal prompt: Pi sends it to the model, and the model may start working on the need. An extension that is not loaded cannot intercept that.

Requires Node 20+ and a Pi version that supports extension commands (`pi.registerCommand`), tool control (`pi.setActiveTools`), and skills in `pi.getCommands()`.

## Usage

| Command | What happens |
|---|---|
| `/function` | Prints the full catalog of all 25 scenarios, then opens a picker |
| `/function <need>` | Matches the need, shows plugins + functions + commands, waits for confirmation, then assembles (never executes the need) |
| `/function <scenario-id>` | Assembles a known scenario directly (still asks first) |
| `/function scan` | Re-scans installed packages, local extensions, and skills |
| `/function status` | Shows the active scenario and enabled plugin tools |
| `/function assign <name> <scenario-id\|none\|infra>` | Overrides classification for one plugin or skill |
| `/function off` | Restores the tool set from before assembly |

`/pi-function` is an alias for `/function`.

Picker rows show both plugin and skill counts, followed by representative skill names; GSD skills are grouped as `GSD N`. The catalog header shows the total skill count, and each scenario lists its own skill count. Example row: `data · 日志 / 性能 / 数据分析 — 2 个插件 · 3 技能（ctx-doctor、ctx-stats、ctx-upgrade）`.

Typical exchange:

```text
/function 把整个项目重构一下

## 场景：大重构 / 迁移
**适用**：跨文件重构、换框架、批量机械替换

**将启用的插件与功能**
- `@quintinshaw/pi-dynamic-workflows` — 动态工作流，fan-out 多代理
- `@plannotator/pi-extension` — 浏览器里审计划/代码
- `@juicesharp/rpiv-todo` — task tracking and progress
- `pi-simplify` — 审查改动并简化

**装配后仍需手动做**
- /plannotator-plan-mode 审计划
- /workflows run … 批量执行
- /simplify 收尾

**装配含义**：启用上述工具、停用其他插件的可选工具、把本场景流程注入系统提示。

[ Yes ]  [ No ]
```

Only `Yes` calls `setActiveTools`. `No` leaves everything untouched. Assembly never runs the need: after `Yes`, the requirement is placed back in the editor — press Enter to start, or clear it. `/function` also prints the full proposal as a visible message before the confirmation dialog, so the plugin list stays in the transcript.

## Scenarios

<details open>
<summary><strong>理解 · Understand</strong></summary>

| id | Scenario | Use when | Plugins |
|---|---|---|---|
| `understand` | Codebase walkthrough | Unfamiliar repo, map the structure, find logic, legacy code | `openwiki`, `pi-lens`, `pi-btw`, `pi-memory`, `pi-web-access` |
| `knowledge` | Knowledge capture | Write findings to long-term memory, maintain a wiki, record decisions | `pi-memory`, `openwiki` |
| `docs` | Docs / wiki / handoff | READMEs, wiki upkeep, handoff notes | `openwiki`, `pi-memory` |

</details>

<details>
<summary><strong>修改 · Modify</strong></summary>

| id | Scenario | Use when | Plugins |
|---|---|---|---|
| `small` | Small edit | One-file fix, typo, copy change, add a log line | — |
| `bugfix` | Bug fix / repro | Stack traces, regressions, unexpected behavior | `context-mode`, `pi-web-access`, `pi-lens` |
| `feature` | New feature | Add a feature end to end with staged progress | `@juicesharp/rpiv-todo`, `pi-lens` |
| `gsd` | GSD spec-driven phases | Spec → plan → execute → verify → ship with fresh-context workers | `@opengsd/gsd-core`, `@juicesharp/rpiv-todo`, `@plannotator/pi-extension` |
| `frontend` | Frontend / visual work | Pages, components, styling, responsive behavior, visual acceptance | `@onkernel/browser-loop`, `@getpipher/vision`, `pi-web-access` |
| `refactor` | Refactor / migration | Cross-file refactors, framework swaps, bulk edits | `@quintinshaw/pi-dynamic-workflows`, `@plannotator/pi-extension`, `@juicesharp/rpiv-todo`, `pi-simplify`, `pi-lens` |
| `tests` | Tests / flaky | Coverage gaps, unstable tests, parallel shards | `pi-lens`, `pi-subagents`, `context-mode` |
| `deps` | Dependency upgrades | Upgrade libraries, fix breaking changes, align versions | `pi-web-access`, `pi-lens` |

</details>

<details>
<summary><strong>验证 · Verify</strong></summary>

| id | Scenario | Use when | Plugins |
|---|---|---|---|
| `review` | Code review / PR writeup | Pre-commit self review, respond to review, PR description | `pi-simplify`, `pi-lens`, `pi-subagents`, `@quintinshaw/pi-dynamic-workflows` |
| `plan` | Plan review | Get a human-approved plan before touching code | `@plannotator/pi-extension`, `@juicesharp/rpiv-todo` |
| `research` | Research | Read docs, compare options, write a tech brief | `pi-web-access`, `pi-memory`, `openwiki`, `pi-subagents`, `@quintinshaw/pi-dynamic-workflows` |
| `data` | Logs / perf / data | Big logs, benchmarks, profiling, stats | `context-mode`, `@quintinshaw/pi-dynamic-workflows` |
| `audit` | Security / dependency audit | Vulnerabilities, licenses, risky calls, dependency risk | `@quintinshaw/pi-dynamic-workflows`, `pi-lens`, `pi-subagents`, `pi-web-access` |
| `webui` | Browser / UI QA | Click flows, screenshots, end-to-end acceptance | `@onkernel/browser-loop`, `@getpipher/vision`, `@plannotator/pi-extension` |

</details>

<details>
<summary><strong>协作 · Collaborate</strong></summary>

| id | Scenario | Use when | Plugins |
|---|---|---|---|
| `parallel` | Parallel workstreams / delegation | Independent modules at the same time | `pi-subagents`, `@juicesharp/rpiv-todo`, `@quintinshaw/pi-dynamic-workflows` |
| `sideask` | Side question | Ask without derailing the main thread | `pi-btw` |
| `advisor` | Second opinion | Trade-offs, architecture calls, another model's critique | `pi-advisor-flow` |
| `release` | Release / CI | Pre-merge checks, CI failures, tags, release notes | `pi-simplify`, `@juicesharp/rpiv-todo`, `pi-subagents` |
| `unattended` | Unattended batch | Run a batch of tasks, long autonomous runs | `@quintinshaw/pi-dynamic-workflows` |

</details>

<details>
<summary><strong>环境 · Environment</strong></summary>

| id | Scenario | Use when | Plugins |
|---|---|---|---|
| `privacy` | Privacy / offline / budget | Sensitive repos, no network, tight token budget | — |
| `mcp` | MCP integrations | Databases, third-party APIs, enterprise systems | `pi-mcp-adapter` |
| `i18n` | Localization | UI language, copy translation, multi-language | `@juicesharp/rpiv-i18n`, `pi-web-access` |

</details>

Plugins you have not installed are simply skipped at assembly time. The scenario still works with whatever is present.

## How assembly works

- **Ownership by path, not by name.** A tool belongs to a plugin if its `sourceInfo.path` lives under that package's `node_modules` directory. New tools from new releases are picked up without editing Pi-function.
- **Enable the scenario, disable the noise.** Optional plugin tools that are not part of the chosen scenario are switched off. Core tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) are always kept, so search and directory listing never disappear after a switch.
- **MCP stays available, except in privacy.** `pi-mcp-adapter` is treated as infrastructure and kept by default; the `privacy` scenario explicitly disables it.
- **A brief goes into the system prompt.** Each scenario injects its workflow rules for the current session (for example: reproduce before fixing; never run parallel editors on the same files).
- **Nothing is uninstalled.** Pi cannot hot-load or hot-unload extension code. "Assembly" means tool visibility plus prompt guidance; the code itself stays resident. `/function off` restores the previous tool set.

The active scenario is recorded with `pi.appendEntry` and shown in `/function status`.

## Auto-accept

Every new plugin and skill is folded into the catalog automatically — no registration. With Pi-function already loaded, no restart is needed while a session is open (installing the extension itself still needs `/reload` or a restart, see above):

1. **At session start**, Pi-function scans `settings.json` packages, the Pi npm tree, local `extensions/`, standalone skills, and skills shipped inside plugins. If skill commands are not registered yet, it also reads `SKILL.md` from agent / project / GSD / package skill roots as a fallback.
2. **While the session runs**, it watches `settings.json`, `skills/`, `extensions/`, and `node_modules/` with a 1.5 s debounce. A fresh install triggers a rescan and a notification.
3. **Classification** runs in this order:
   - a curated map for well-known packages (`KNOWN_SCENARIO`);
   - strong signal words per scenario (`SCENARIO_HINTS`);
   - keyword scoring over package names, tool names, commands, and descriptions.
4. **Anything unmatched** lands in *Unclassified* instead of being forced into a wrong scenario. Assign it once:

```bash
/function assign @scope/package-name refactor
/function assign skill:my-skill knowledge
/function assign leftpad none
```

Infrastructure packages that should not take part in assembly (context compressors, safety guards, themes, telemetry, this extension itself) are listed under **Resident / not assembled** in the catalog.

Classification is versioned. Upgrading reclassifies auto-assigned entries but preserves manual `/function assign` overrides. GSD's 72 phase skills collapse into the `gsd` scenario and appear as a count instead of flooding the catalog.

## Files

| Path | Purpose |
|---|---|
| `function-menu.js` | The whole extension: catalog, matcher, classifier, assembler, watcher |
| `test.mjs` | Zero-dependency regression tests: scenarios, core tools, skill mapping, migration, catalog summary |
| `~/.pi/agent/function-menu.json` | Runtime store: discovered items, assignments, overrides |
| `assets/banner.svg` | Generated banner (official Pi mark + white pixel wordmark) |
| `assets/pi-logo.svg` | Official Pi logo, unchanged from [pi.dev/logo-auto.svg](https://pi.dev/logo-auto.svg) |
| `scripts/render-banner.mjs` | Regenerates the banner: `node scripts/render-banner.mjs` |

Set `PI_CODING_AGENT_DIR` to relocate the agent directory.

## Extending

Add a scenario by appending to `SCENARIOS` in `function-menu.js`:

```js
{
  id: "perf",
  group: "验证",
  title: "性能优化",
  when: "慢查询、内存涨、启动时间",
  keywords: ["性能", "变慢", "profile", "latency"],
  plugins: ["context-mode", "pi-lens"],
  brief: "先量再改：用 ctx_execute 跑 benchmark ...",
  manual: ["/lens-perf 查看诊断"],
}
```

Then add its hints to `SCENARIO_HINTS` and, if you want a fixed home for a known package, to `KNOWN_SCENARIO`. No other wiring is required.

## Design notes

- Single file, zero runtime dependencies.
- No network access, no telemetry, no shell-outs.
- Classification is deterministic and inspectable in `function-menu.json`.
- Approval is enforced in the command handler; there is no auto-apply path.
- Windows, macOS, and Linux paths all go through `node:path`.

## License

MIT © 2026 ppTeyven

The Pi mark is the official logo from [pi.dev](https://pi.dev), used unchanged and unmodified. Pi is a project by Mario Zechner / Earendil Works.

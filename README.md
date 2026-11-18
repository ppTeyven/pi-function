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
    <a href="#usage">Usage</a> ·
    <a href="#scenarios">Scenarios</a> ·
    <a href="#workflows">Workflows</a> ·
    <a href="#per-user-profile">Profile</a> ·
    <a href="README.zh-CN.md">中文</a>
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

## Usage

| Command | What happens |
|---|---|
| `/function` | Prints the catalog, asks for a workflow, then an application scenario, and assembles after approval |
| `/function <need>` | Analyzes the need across multiple application types, asks for a workflow, composes plugins/skills from the profile, and assembles after approval; never opens the fixed task picker and never executes the need |
| `/function scan` | Re-scans installed packages, local extensions, and skills, then rebuilds the profile |
| `/function status` | Shows the active workflow × scenario and enabled plugin tools |
| `/function assign <name> <scenario-id\|none>` | Manually overrides one profile binding |
| `/function off` | Restores the tool set from before assembly |

`/pi-function` is an alias.

Picker rows show plugin and skill counts. A typical fixed-menu exchange:

```text
/function

第 1 步：先选工作流（怎么执行）
  outline · 结构先行 — ★ 推荐 · 1 个插件
  direct · 直接产出 — 无额外插件
  ...

第 2 步：再选应用场景（做什么）
  webpage · 网页 / 落地页 / 官网 — 2 个插件 · 3 技能（frontend-design、...）
  ...

## 装配：结构先行 × 网页 / 落地页 / 官网
**工作流**：先给出结构/目录/页面清单，确认后再产出
**场景**：官网、落地页、营销页、响应式页面

**将启用的插件与功能**
- ... — 能力描述、工具、命令、技能
...
```

Only **Yes** calls `setActiveTools`. **No** leaves everything untouched. After **Yes**, a free-text requirement is placed back in the editor; press Enter to start it.

## Scenarios

Scenarios are application/output types, not engineering activities.

| Group | IDs | What you are making |
|---|---|---|
| 内容 | `article` | 文章、文案、博客、公众号 |
| 内容 | `report` | 报告、调研、白皮书、方案 |
| 内容 | `presentation` | 演示、PPT、路演 |
| 内容 | `docs` | 文档、教程、知识库、交接 |
| 产品 | `webpage` | 网页、落地页、官网 |
| 产品 | `webapp` | Web 应用、管理后台、SaaS |
| 产品 | `mobile` | App、小程序、移动端 |
| 产品 | `game` | 游戏、互动体验、小游戏 |
| 视觉 | `design` | 视觉设计、品牌、UI 稿 |
| 视觉 | `data` | 数据、图表、分析结果 |
| 系统 | `api` | API、后端、CLI、SDK |
| 系统 | `automation` | 自动化、爬虫、定时任务 |
| 系统 | `integration` | 集成、MCP、外部系统 |
| 系统 | `plugin` | Pi 插件、扩展、工具 |
| 维护 | `maintain` | 维护现有项目、修 bug、重构、测试 |
| 维护 | `localization` | 本地化、翻译、多语言 |
| 通用 | `general` | 其他任务 |

## Workflows

The workflow is the execution style; the scenario adds domain capabilities. Duplicate packages are merged.

| id | Workflow | Use when |
|---|---|---|
| `direct` | 直接产出 | Clear, small output; no extra process |
| `outline` | 结构先行 | Outline/plan first, then produce |
| `prototype` | 原型先行 | Visual or interactive output; iterate on a prototype |
| `parallel` | 并行探索 | Independent slices can run at the same time |
| `review-gate` | 评审守门 | Independent review before delivery |
| `phased` | 阶段推进 | Multi-stage work with spec, plan, and acceptance |
| `offline` | 隐私 / 离线 | Nothing leaves the machine; network capabilities are excluded |

## Per-user profile

On first load and on every scan, Pi-function reads the installed packages, extensions, tools, commands, and skills, scores them against generic capability roles, and writes:

```text
~/.pi/agent/function-menu.profile.json
```

The profile contains role → package/skill bindings, descriptions, and a fingerprint. When a new plugin or skill appears, the fingerprint changes and the profile is rebuilt automatically. The file is per-user and should not be committed.

The catalog is hydrated from this profile at runtime. That is why the same `webpage` or `article` ID can use different tools on different machines without changing the extension source.

Manual overrides are stored in `~/.pi/agent/function-menu.json` and survive profile rebuilds.

## Dynamic needs

`/function "做一个产品官网，并写一篇发布文章"` does not choose one scenario. It:

1. detects multiple application signals (for example `webpage` + `article`);
2. collects matching capability roles, packages, and skills from the profile;
3. asks only for a workflow;
4. shows the composition and asks for approval.

If nothing matches, it still proposes a capability-based combination instead of refusing. The requirement is never sent automatically.

## What assembly changes

- enables the selected plugin tools;
- keeps core tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) available;
- disables optional tools from other plugins;
- injects the workflow and scenario process into the system prompt;
- leaves plugin code loaded; it does not uninstall anything.

## Development

```bash
npm test
```

The tests build synthetic capability profiles, verify that stable IDs resolve differently for different package sets, exercise dynamic multi-intent analysis, and cover the two-step command flow.

## License

MIT

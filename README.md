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
2. Run `/function`. It prints the catalog, then opens the first picker.
3. **Choose a workflow** — how this run should proceed (outline, prototype, review gate, and so on).
4. **Choose an application scenario** — what you want to make (webpage, article, game, report, and so on).
5. Review the assembly proposal. Nothing changes until you approve it.
6. After assembly, describe the task. The extension never executes your request by itself.

If you only want an execution style, run `/function workflow`; it asks for a workflow and does not bind a task scenario.

### Commands

| Command | What happens |
|---|---|
| `/function` | Prints the catalog, asks for a workflow, then an application scenario, and assembles after approval |
| `/function workflow` | Asks only for a workflow and enables it without binding a task scenario |
| `/function <need>` | Analyzes the need across multiple application types, asks for a workflow, composes plugins/skills from the profile, and assembles after approval; never opens the fixed task picker and never executes the need |
| `/function scan` | Re-scans installed packages, local extensions, and skills, then rebuilds the profile |
| `/function status` | Shows the active workflow × scenario (or workflow-only mode) and enabled plugin tools |
| `/function assign <name> <scenario-id\|none>` | Manually overrides one profile binding |
| `/function off` | Restores the tool set from before assembly |

`/pi-function` is an alias.

Picker rows show plugin and skill counts. A typical fixed-menu exchange:

```text
/function

Step 1: choose a workflow (how to execute)
  outline · Outline first — ★ recommended · 1 plugin
  direct · Direct output — no extra plugins
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

The workflow is the execution style; the scenario adds domain capabilities. Duplicate packages are merged.

| id | Workflow | Use when |
|---|---|---|
| `direct` | Direct output | Clear, small scope; act now without a separate plan |
| `outline` | Outline first | Produce an outline or plan, confirm it, then expand |
| `prototype` | Prototype first | Build a viewable/clickable minimum, then iterate |
| `parallel` | Parallel exploration | Independent slices or alternative solutions run concurrently |
| `review-gate` | Review gate | Independent review before delivery |
| `phased` | Phased delivery | Spec → plan → stage-by-stage acceptance for long work |
| `offline` | Privacy / offline | Local tools only; network capabilities are excluded |

## Per-user profile

On first load and on every scan, Pi-function reads the installed packages, extensions, tools, commands, and skills, scores them against generic capability roles, and writes:

```text
~/.pi/agent/function-menu.profile.json
```

The profile contains role → package/skill bindings, descriptions, and a fingerprint. When a new plugin or skill appears, the fingerprint changes and the profile is rebuilt automatically. The file is per-user and should not be committed.

The catalog is hydrated from this profile at runtime. That is why the same `webpage` or `article` ID can use different tools on different machines without changing the extension source.

Manual overrides are stored in `~/.pi/agent/function-menu.json` and survive profile rebuilds.

## Dynamic needs

`/function "build a product site and write a launch article"` does not choose one scenario. It:

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

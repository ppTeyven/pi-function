# Contributing

Thanks for looking. This file covers the things that are easy to get wrong.

## Local development

Pi loads `function-menu.js` from `~/.pi/agent/extensions/` (or through `pi install <path>`).
Pick **one** mode:

| Mode | Setup | Apply changes |
|---|---|---|
| Local file (recommended while developing) | copy or symlink `function-menu.js` into `~/.pi/agent/extensions/` | `/reload` |
| Package install | `pi install ./path/to/pi-function` | `pi update --extensions` |

**Do not do both at once.** Two copies register `/function` twice and the behaviour
becomes unpredictable — the second registration wins and the other copy still
reacts to the same events.

## Tests

```bash
npm test          # ~654 tests, a few seconds
```

Layout:

- `tests/enable-*.test.mjs` — behaviour tests driven by a mock `pi` (`tests/lib/mock-pi.mjs`)
- `tests/banner.test.mjs` — asset geometry

The mock is deliberate. A tool's `sourceInfo` differs between built-in tools
(`builtin:<name>`), npm packages (`npm:<pkg>` + a `node_modules` path), local
extensions (`local:<file>`) and SDK tools (`<sdk:name>`). **Never assume one
shape** — that mistake once made `/function off` drop `bash` on pi-web.

Rules the suite enforces (do not weaken these):

| Rule | Test |
|---|---|
| `EXT_VERSION` equals `package.json` version | `enable-*` |
| `/function off` keeps `read/bash/edit/write` even when they are not `builtin:` | `enable-21` |
| Required capabilities of a scenario are force-completed, never silently skipped | `enable-19` |
| `store.active` written by `applyScenario` is readable by `loadStore` | `enable-29` |
| No tool name reaches `setActiveTools` unless it is registered | `enable-28` (properties) |

## Versioning

Both places, always together:

```text
package.json      "version": "3.0.1"
function-menu.js  const EXT_VERSION = "3.0.1";
```

`/function status` prints `EXT_VERSION`; npm and the gallery read `package.json`.

## Release checklist

1. Bump both versions (above).
2. Add a `## 3.0.1` section at the top of `CHANGELOG.md`. Version headings follow
   Pi's changelog format (`## 3.0.1`), which is what Pi matches against
   `package.json` when showing an update notice.
3. `npm test` — must be green.
4. Commit, tag, push:
   ```bash
   git commit -am "release: 3.0.1"
   git tag v3.0.1
   git push origin main v3.0.1
   ```
5. Publish:
   ```bash
   npm publish
   ```
   The first publish of a new package goes through **staged publishing**: the
   registry initially shows a placeholder version `0.0.0-stage` described as
   *"Temporary package placeholder for staged publishing"*. That is normal —
   the real version replaces it within a minute or two. Verify:
   ```bash
   npm view pi-function version
   ```
6. GitHub release:
   ```bash
   gh release create v3.0.1 --notes-file notes.md
   ```

## npm credentials

Publishing requires 2FA. Either:

- one-off: `npm publish --otp=<6 digits>`
- recurring: a **granular access token** with *Bypass 2FA*, permissions
  `Read and write`, scoped to the `pi-function` package only, installed with
  ```bash
  npm config set //registry.npmjs.org/:_authToken=npm_...
  ```

Never commit `.npmrc`, tokens, or logs containing them.

## Gallery listing

`pi.dev/packages` lists npm packages that carry the `pi-package` keyword (see
`docs/packages.md` in the Pi docs). Optional `pi.image` / `pi.video` fields add
previews. There is nothing to submit — the catalog scans npm on its own
schedule, so a fresh release can take hours to days to appear.

## Design constraints

- Single file, zero dependencies, zero network calls, zero telemetry.
- **This extension's own tools never take part in the assembly switch.**
  `suggest_scenario` and `assemble_scenario` live under `~/.pi/agent/extensions/`,
  so `isOptionalSource()` classifies them as optional — and `applyScenario`
  switches every optional tool off unless the scene wants it. That once made a
  single assembly lock the model out of both tools (the key was locked inside
  the door). They are infrastructure: always active, never in `disabled`, never
  audited as plugins. `/function <need>` additionally re-activates them right
  before handing the need to the model, as a second line of defence.
- The model reads the need; the local algorithm decides which tools open.
  Keep that boundary — do not let a model response choose tool names directly.
- The unacceptable outcome is **the user not having the tool they needed**.
  When in doubt, over-enable and say so.
- `/function ...` must never silently degrade: every skip, every missing plugin
  and every auto-completion has to be visible to the user.

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
| Manual presets retain required-capability checks; model proposals are never auto-expanded | `enable-19`, `enable-08` |
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
3. Run `npm test`, then capture and score the release benchmark. `npm run capture:release -- --out <new-results.json> --limit 8` starts a batch; repeat with `--resume --out <same-file> --limit 8` for the remaining cases (one writer per file). Each case is saved before moving to the next. Capture uses the configured Pi model on synthetic/public evidence and declines every confirmation. Supply `--sdk <dist/index.js>` outside Windows pi-web. Once complete, `npm run verify:release -- --results <same-file>` rejects partial, stale, or wrong-dataset results. See `TEST-PLAN.md` for the other gates. Do not change labels to make a run pass.
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

### Diagnose a missing proposal

Run `npm run capture:release -- --diagnose --case <id> --out <new-local-file.json>` to investigate one case without replacing its accepted release capture. Cases without a valid proposal also record diagnostics during ordinary capture. This logs tool outcomes, unexpected legacy request ID use (not the ID itself), and the model's final visible text. It does not log raw prompts or reasoning. Diagnostic artifacts are deliberately rejected by `verify:release`; do not commit local capture files.

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

- Single extension file, no added runtime dependency or telemetry. Model analysis uses the current Pi model; don't add a provider.
- **Treat `suggest_scenario` and `assemble_scenario` as infrastructure.**
  `/function off` keeps both available unless explicitly excluded in Pi settings;
  project commands do not change the active set to start model analysis.
- The model chooses project stage, targets, workflow and exact resources.
  `suggest_scenario` lists facts; `assemble_scenario` validates the submitted IDs,
  displays the enable/disable diff, and only applies an approved proposal. No local
  ranker, default bundle, or automatic capability refill on this path.
- Project evidence and proposals bind to an active `before_agent_start` turn using host-only custom-message metadata, never a model-supplied ID. `agent_settled` retires the binding. Standalone model assembly in an ordinary turn must explicitly submit `standalone: true` and omit project progress, so an expired project proposal cannot fall back to standalone confirmation.
- Report model-unavailable states, gaps, declined proposals, and host readback
  mismatches explicitly. Keep the manual preset path separate from model plans.

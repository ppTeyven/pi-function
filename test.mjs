import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import functionMenu from "./function-menu.js";
import {
  SCENARIOS,
  CORE_TOOLS,
  classifyItem,
  SCENARIOS as ALL_SCENARIOS,
  WORKFLOWS,
  scenarioPackages,
  comboPackages,
  workflowOptions,
  recommendWorkflow,
  summarizeSkills,
  buildCatalog,
  buildProposal,
  menuOptions,
  reconcile,
  applyScenario,
  discoverItems,
} from "./function-menu.js";

const ids = SCENARIOS.map((s) => s.id);
assert.equal(SCENARIOS.length, 25);
for (const id of ["understand", "docs", "gsd", "frontend", "privacy"]) assert.ok(ids.includes(id), id);
for (const s of SCENARIOS) {
  assert.ok(!s.plugins.includes("rpiv-todo"), `${s.id} still uses the unqualified rpiv-todo id`);
  assert.ok(!s.plugins.includes("cc-safety-net"), `${s.id} should treat cc-safety-net as infrastructure`);
}

assert.deepEqual(CORE_TOOLS, ["read", "bash", "edit", "write", "grep", "find", "ls"]);

assert.equal(WORKFLOWS.length, 6);
const workflowIds = WORKFLOWS.map((w) => w.id);
for (const id of ["direct", "plan-first", "test-first", "fanout", "review-gate", "phased"]) {
  assert.ok(workflowIds.includes(id), id);
  assert.ok(!ids.includes(id), `${id} must not collide with a task id`);
}
assert.ok(workflowOptions("phased")[0].startsWith("phased · "));
assert.match(workflowOptions("phased")[0], /★ 推荐/);
assert.equal(recommendWorkflow(ALL_SCENARIOS.find((s) => s.id === "gsd")), "phased");
assert.equal(recommendWorkflow(ALL_SCENARIOS.find((s) => s.id === "tests")), "test-first");
assert.equal(recommendWorkflow(ALL_SCENARIOS.find((s) => s.id === "review")), "review-gate");
assert.equal(recommendWorkflow(ALL_SCENARIOS.find((s) => s.id === "understand")), "direct");
assert.equal(classifyItem({ kind: "skill", id: "skill:gsd-quick", text: "" }).scenarioId, "gsd");
assert.equal(classifyItem({ kind: "skill", id: "skill:architect", text: "" }).scenarioId, "plan");
assert.equal(classifyItem({ kind: "skill", id: "skill:de-slop", text: "" }).scenarioId, "frontend");
assert.equal(classifyItem({ kind: "skill", id: "skill:handoff", text: "" }).scenarioId, "docs");
assert.equal(classifyItem({ kind: "skill", id: "skill:safe-refactor", text: "" }).scenarioId, "refactor");

const store = {
  known: {
    "skill:gsd-quick": { kind: "skill", label: "gsd-quick", scenario: "feature", auto: true, missing: false },
    "skill:gsd-plan-phase": { kind: "skill", label: "gsd-plan-phase", scenario: "plan", auto: true, missing: false },
    "local:zz-tools-dump": { kind: "plugin", label: "zz-tools-dump", scenario: "review", auto: true, missing: false },
  },
  overrides: {},
  classifierVersion: 1,
};
const items = new Map([
  ["skill:gsd-quick", { id: "skill:gsd-quick", kind: "skill", label: "gsd-quick", text: "quick", skills: ["skill:gsd-quick"] }],
  ["skill:gsd-plan-phase", { id: "skill:gsd-plan-phase", kind: "skill", label: "gsd-plan-phase", text: "plan-phase", skills: ["skill:gsd-plan-phase"] }],
]);
reconcile(store, items);
assert.equal(store.classifierVersion, 3);
assert.equal(store.known["skill:gsd-quick"].scenario, "gsd");
assert.equal(store.known["skill:gsd-plan-phase"].scenario, "gsd");
assert.ok(!("local:zz-tools-dump" in store.known));

assert.deepEqual(scenarioPackages(SCENARIOS.find((s) => s.id === "privacy"), { known: {} }), []);
assert.deepEqual(comboPackages(
  SCENARIOS.find((s) => s.id === "privacy"),
  { known: {} },
  WORKFLOWS.find((w) => w.id === "fanout"),
), []);
assert.ok(comboPackages(
  SCENARIOS.find((s) => s.id === "feature"),
  { known: {} },
  WORKFLOWS.find((w) => w.id === "phased"),
).includes("@opengsd/gsd-core"));
assert.deepEqual(
  scenarioPackages(SCENARIOS.find((s) => s.id === "mcp"), { known: {} }),
  ["pi-mcp-adapter"],
);

const summary = summarizeSkills(["gsd-quick", "gsd-plan-phase", "btw"]);
assert.match(summary, /btw/);
assert.match(summary, /GSD 阶段技能 2 个/);

let activeTools = ["read", "bash", "mcp"];
const fakePi = {
  getAllTools: () => [
    ...["read", "bash", "edit", "write", "grep", "find", "ls"].map((name) => ({ name, sourceInfo: { path: `builtin:${name}` } })),
    { name: "lens_diagnostics", sourceInfo: { path: "C:/x/node_modules/pi-lens/index.js" } },
    { name: "todo", sourceInfo: { path: "C:/x/node_modules/@juicesharp/rpiv-todo/index.js" } },
    { name: "gsd_invoke", sourceInfo: { path: "C:/x/node_modules/@opengsd/gsd-core/index.js" } },
    { name: "mcp", sourceInfo: { path: "C:/x/node_modules/pi-mcp-adapter/index.js" } },
  ],
  getActiveTools: () => activeTools,
  setActiveTools: (next) => { activeTools = [...next]; },
  getCommands: () => [],
};
const catalogStore = {
  known: {
    "skill:gsd-quick": { kind: "skill", label: "gsd-quick", scenario: "gsd", auto: true, missing: false },
    "skill:gsd-plan-phase": { kind: "skill", label: "gsd-plan-phase", scenario: "gsd", auto: true, missing: false },
  },
};
const catalog = buildCatalog(fakePi, catalogStore);
assert.match(catalog, /25 个组合 · 2 个技能/);
assert.match(catalog, /第 1 步：工作流/);
assert.match(catalog, /第 2 步：任务场景/);
assert.match(catalog, /技能 2 个/);
assert.match(catalog, /GSD 阶段技能 2 个/);
const picker = menuOptions(catalogStore);
const gsdOption = picker.find((option) => option.startsWith("gsd · "));
assert.match(gsdOption, /\d+ 个插件 · 2 技能（GSD 2）/);
assert.match(picker.find((option) => option.startsWith("understand · ")), /0 技能/);
assert.ok(catalog.length < 12000, "catalog should summarize large skill groups");
const proposal = buildProposal(fakePi, SCENARIOS.find((s) => s.id === "gsd"), catalogStore);
assert.match(proposal, /核心工具始终保留/);
assert.match(proposal, /自动归入技能 2 个/);
assert.match(proposal, /GSD 阶段技能 2 个/);
const comboProposal = buildProposal(
  fakePi,
  SCENARIOS.find((s) => s.id === "feature"),
  { known: {} },
  WORKFLOWS.find((w) => w.id === "phased"),
);
assert.match(comboProposal, /## 装配：阶段推进 × 写新功能/);
assert.match(comboProposal, /\*\*工作流\*\*/);
assert.match(comboProposal, /discuss → plan → execute → verify → ship/);

const applied = applyScenario(fakePi, { ui: { notify: () => {} } }, SCENARIOS.find((s) => s.id === "gsd"), catalogStore);
for (const name of ["read", "bash", "edit", "write", "grep", "find", "ls", "mcp", "gsd_invoke"]) {
  assert.ok(applied.next.includes(name), `applyScenario lost ${name}`);
}
assert.ok(!applied.next.includes("lens_diagnostics"), "unrelated optional tools should be disabled");
const appliedWorkflow = applyScenario(
  fakePi,
  { ui: { notify: () => {} } },
  SCENARIOS.find((s) => s.id === "feature"),
  { known: {} },
  undefined,
  WORKFLOWS.find((w) => w.id === "phased"),
);
for (const name of ["todo", "gsd_invoke"]) {
  assert.ok(appliedWorkflow.next.includes(name), `workflow assembly lost ${name}`);
}

const skillCommandPi = {
  getAllTools: () => [],
  getCommands: () => [{ name: "skill:my-skill", source: "skill", description: "demo", sourceInfo: { path: "C:/x/custom.js" } }],
};
const discovered = discoverItems(skillCommandPi);
assert.ok(discovered.has("skill:my-skill"));
assert.equal(discovered.get("skill:my-skill").label, "my-skill");
assert.deepEqual(discovered.get("skill:my-skill").skills, ["my-skill"]);

// End-to-end command flow: workflow picker must come before the task picker.
const tempAgent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-function-test-"));
const previousAgent = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = tempAgent;
const core = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const flowTools = [
  ...core.map((name) => ({ name, sourceInfo: { path: `builtin:${name}` } })),
  { name: "todo", sourceInfo: { path: "C:/x/node_modules/@juicesharp/rpiv-todo/index.js" } },
  { name: "gsd_invoke", sourceInfo: { path: "C:/x/node_modules/@opengsd/gsd-core/index.js" } },
  { name: "mcp", sourceInfo: { path: "C:/x/node_modules/pi-mcp-adapter/index.js" } },
];
let flowActive = ["read", "mcp"];
const commands = {};
const entries = [];
const prompts = [];
const selections = ["plan-first", "feature"];
const fakeFlowPi = {
  getAllTools: () => flowTools,
  getActiveTools: () => flowActive,
  setActiveTools: (next) => { flowActive = [...next]; },
  getCommands: () => [],
  registerCommand: (name, command) => { commands[name] = command; },
  registerTool: () => {},
  on: () => {},
  appendEntry: (type, data) => entries.push({ type, data }),
  sendMessage: () => {},
};
functionMenu(fakeFlowPi);
const flowCtx = {
  hasUI: true,
  ui: {
    select: async (prompt, options) => {
      prompts.push(prompt);
      const prefix = selections.shift();
      return options.find((option) => option.startsWith(prefix));
    },
    confirm: async () => true,
    notify: () => {},
    setEditorText: () => {},
  },
};
{
  const result = await commands.function.handler("", flowCtx);
  void result;
  assert.match(prompts[0], /工作流/);
  assert.match(prompts[1], /任务/);
  assert.equal(entries.at(-1).data.workflow, "plan-first");
  assert.equal(entries.at(-1).data.id, "feature");
  assert.ok(flowActive.includes("todo"), "workflow + task assembly lost todo");
}
{
  prompts.length = 0;
  selections.push("phased", "bugfix");
  await commands.function.handler('"修 bug"', flowCtx);
  assert.match(prompts[0], /工作流/);
  assert.match(prompts[1], /任务/);
  assert.equal(entries.at(-1).data.workflow, "phased");
  assert.equal(entries.at(-1).data.id, "bugfix");
}
process.env.PI_CODING_AGENT_DIR = previousAgent;
fs.rmSync(tempAgent, { recursive: true, force: true });

console.log("ok: 25 scenarios, workflows, core tools, skill mapping, migration, privacy, catalog summary");

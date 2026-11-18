import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import functionMenu from "./function-menu.js";
import {
  SCENARIOS,
  SCENARIO_CONTRACTS,
  WORKFLOWS,
  workflowOnlyScenario,
  CAPABILITIES,
  WORKFLOW_SKILL_PATTERNS,
  CORE_TOOLS,
  CLASSIFIER_VERSION,
  buildProfile,
  hydrateCatalog,
  classifyItem,
  scenarioPackages,
  scenarioSkillIds,
  comboPackages,
  comboSkillIds,
  isIdCombo,
  workflowOptions,
  recommendWorkflow,
  normalizeWorkflowId,
  workflowById,
  summarizeSkills,
  buildCatalog,
  buildProposal,
  menuOptions,
  reconcile,
  applyScenario,
  discoverItems,
  analyzeNeed,
  dynamicScenario,
  loadStore,
  saveStore,
} from "./function-menu.js";

const ids = SCENARIOS.map((s) => s.id);
assert.equal(SCENARIOS.length, 34);
for (const id of ["article", "email", "social", "novel", "video", "music", "image", "course", "resume", "event", "report", "presentation", "docs", "legal", "webpage", "webapp", "commerce", "mobile", "game", "design", "data", "spreadsheet", "dashboard", "api", "automation", "tool", "integration", "chatbot", "plugin", "maintain", "localization", "general"]) {
  assert.ok(ids.includes(id), `missing application scenario ${id}`);
}
for (const old of ["feature", "refactor", "bugfix", "review", "frontend"]) {
  assert.ok(!ids.includes(old), `old activity scenario ${old} should be gone`);
}
assert.deepEqual(CORE_TOOLS, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
assert.equal(WORKFLOWS.length, 9);
const workflowIds = WORKFLOWS.map((w) => w.id);
for (const id of ["direct", "outline", "research", "debug", "parallel", "review-gate", "phased", "offline"]) {
  assert.ok(workflowIds.includes(id), id);
  assert.ok(!ids.includes(id), `${id} must not collide with a task id`);
  assert.ok(WORKFLOWS.find((w) => w.id === id).steps.length >= 3, `${id} needs process steps`);
}
assert.ok(workflowOptions("outline")[0].startsWith("outline · "));
assert.match(workflowOptions("outline")[0], /★ 推荐/);
assert.match(workflowOptions("outline")[0], /先出提纲/);

assert.match(workflowOptions("direct")[0], /需求清楚、范围小/);
assert.equal(recommendWorkflow(SCENARIOS.find((s) => s.id === "maintain")), "debug");
assert.equal(recommendWorkflow(SCENARIOS.find((s) => s.id === "report")), "research");
assert.equal(recommendWorkflow(SCENARIOS.find((s) => s.id === "webpage")), "outline");
assert.equal(normalizeWorkflowId("prototype"), "outline");
assert.equal(normalizeWorkflowId("iterate"), "review-gate");
assert.equal(workflowById("prototype").id, "outline");
assert.equal(recommendWorkflow(SCENARIOS.find((s) => s.id === "article")), "outline");
assert.equal(recommendWorkflow(SCENARIOS.find((s) => s.id === "general")), "direct");
assert.equal(typeof CAPABILITIES, "object");
assert.ok(Object.keys(CAPABILITIES).length >= 20);

// Synthetic user: two machines with different packages must resolve the same IDs differently.
const syntheticStore = {
  known: {
    "npm:pi-web-access": {
      kind: "plugin",
      label: "pi-web-access",
      description: "web search and fetch",
      tools: ["web_search"],
      commands: ["websearch"],
      missing: false,
    },
    "npm:pi-subagents": {
      kind: "plugin",
      label: "pi-subagents",
      description: "delegate tasks to subagents",
      tools: ["subagent"],
      missing: false,
    },
    "npm:@opengsd/gsd-core": {
      kind: "plugin",
      label: "@opengsd/gsd-core",
      description: "spec driven phased workflow",
      tools: ["gsd_invoke"],
      missing: false,
    },
    "npm:pi-lens": {
      kind: "plugin",
      label: "pi-lens",
      description: "code intelligence lsp diagnostics",
      tools: ["symbol_search"],
      missing: false,
    },
    "npm:@juicesharp/rpiv-todo": {
      kind: "plugin",
      label: "@juicesharp/rpiv-todo",
      description: "task list and progress",
      tools: ["todo"],
      missing: false,
    },
    "npm:@plannotator/pi-extension": {
      kind: "plugin",
      label: "@plannotator/pi-extension",
      description: "plan review and approval",
      tools: ["plannotator_submit_plan"],
      missing: false,
    },
    "npm:pi-simplify": {
      kind: "plugin",
      label: "pi-simplify",
      description: "simplify and cleanup",
      commands: ["simplify"],
      missing: false,
    },
    "npm:pi-memory": {
      kind: "plugin",
      label: "pi-memory",
      description: "long term memory and notes",
      tools: ["memory_write"],
      missing: false,
    },
    "npm:openwiki": {
      kind: "plugin",
      label: "openwiki",
      description: "repository wiki and code map",
      tools: ["openwiki_search"],
      missing: false,
    },
    "skill:frontend-design": {
      kind: "skill",
      label: "frontend-design",
      description: "frontend ui design and visual polish",
      missing: false,
    },
    "skill:gsd-quick": {
      kind: "skill",
      label: "gsd-quick",
      description: "quick phased task",
      missing: false,
    },
  },
  overrides: {},
  classifierVersion: CLASSIFIER_VERSION,
};

const profile = buildProfile(syntheticStore);
assert.ok(profile.roles.web.packages.some((p) => p.id === "pi-web-access"), "web role missed web package");
assert.ok(profile.roles.subagent.packages.some((p) => p.id === "pi-subagents"), "subagent role missed package");
assert.ok(profile.roles.gsd.packages.some((p) => p.id === "@opengsd/gsd-core"), "gsd role missed package");

// Env-gated browser package must not bind when KERNEL_API_KEY is absent.
const savedKernel = process.env.KERNEL_API_KEY;
delete process.env.KERNEL_API_KEY;
const browserProfile = buildProfile({
  known: {
    "npm:@onkernel/browser-loop": { kind: "plugin", label: "@onkernel/browser-loop", description: "browser automation", tools: ["browser"], missing: false },
    "skill:playwright-cli": { kind: "skill", label: "playwright-cli", description: "browser automation and e2e", missing: false },
  },
  overrides: {},
  classifierVersion: CLASSIFIER_VERSION,
});
assert.ok(!browserProfile.roles.browser.packages.some((p) => p.id === "@onkernel/browser-loop"), "env-gated browser package must be skipped");
assert.ok(browserProfile.roles.browser.skills.some((s) => s.id === "playwright-cli"), "browser skills must remain");
if (savedKernel !== undefined) process.env.KERNEL_API_KEY = savedKernel;

// Role deny/threshold rules: noisy descriptions must not leak into unrelated roles.
const noiseProfile = buildProfile({
  known: {
    "skill:multi-search-engine": { kind: "skill", label: "multi-search-engine", description: "多源搜索、交叉验证与结果去重", missing: false },
    "skill:gongwenformat-pro": { kind: "skill", label: "gongwenformat-pro", description: "公文排版与 Word 格式化", missing: false },
    "skill:ima-skill": { kind: "skill", label: "ima-skill", description: "IMA 知识库、笔记与资料检索", missing: false },
    "skill:humanizer": { kind: "skill", label: "humanizer", description: "去除 AI 味，润色中文写作", missing: false },
  },
  overrides: {},
  classifierVersion: CLASSIFIER_VERSION,
});
const noiseInfo = noiseProfile.itemInfo;
assert.deepEqual(noiseInfo["multi-search-engine"].roles, ["web"], "search must not leak into testing/data");
assert.ok(!noiseInfo["gongwenformat-pro"].roles.includes("design"), "gongwen formatting is not design");
assert.ok(!noiseInfo["gongwenformat-pro"].roles.includes("docs"), "gongwen formatting is not docs");
assert.deepEqual(noiseInfo["ima-skill"].roles, ["docs"], "IMA belongs to docs, not memory");
assert.deepEqual(noiseInfo["humanizer"].roles, ["writing"], "humanizer belongs to writing");
assert.ok(noiseInfo["multi-search-engine"].roles.length <= 2, "skills cap at two roles");
assert.ok(profile.roles.design.skills.some((s) => s.id === "frontend-design"), "design role missed skill");
hydrateCatalog(profile);
for (const workflow of WORKFLOWS) {
  assert.ok(Array.isArray(workflow.plugins), `${workflow.id} needs a plugin bundle`);
  assert.ok(Array.isArray(workflow.skills), `${workflow.id} needs a skill bundle`);
}
assert.match(workflowOptions("outline")[0], /插件/);
assert.equal(WORKFLOW_SKILL_PATTERNS.debug.deny.test("primary"), false, "deny pattern must not match primary");
assert.equal(WORKFLOW_SKILL_PATTERNS.debug.deny.test("multi-search-engine"), true, "debug must reject search skills");

const webpage = SCENARIOS.find((s) => s.id === "webpage");
assert.ok(scenarioPackages(webpage, syntheticStore).includes("pi-web-access"), "webpage did not hydrate web package");
assert.ok(scenarioSkillIds(syntheticStore, "webpage").includes("frontend-design"), "webpage did not hydrate design skill");
assert.ok(!scenarioPackages(webpage, syntheticStore).includes("pi-subagents"), "webpage should not pull unrelated subagent package");
const outline = WORKFLOWS.find((w) => w.id === "outline");
const research = WORKFLOWS.find((w) => w.id === "research");
const debug = WORKFLOWS.find((w) => w.id === "debug");
const parallel = WORKFLOWS.find((w) => w.id === "parallel");
const reviewGate = WORKFLOWS.find((w) => w.id === "review-gate");
const phased = WORKFLOWS.find((w) => w.id === "phased");
assert.ok(outline.plugins.includes("@juicesharp/rpiv-todo"), "outline should include task tracking");
assert.ok(research.plugins.includes("pi-web-access"), "research should include web");
assert.ok(research.plugins.includes("openwiki"), "research should include repo wiki");
assert.ok(debug.plugins.includes("pi-lens"), "debug should include code intelligence");
assert.ok(parallel.plugins.includes("pi-subagents"), "parallel should include subagents");
assert.ok(reviewGate.plugins.includes("pi-subagents"), "review should share subagents");
assert.ok(phased.plugins.includes("@opengsd/gsd-core"), "phased should include GSD");
assert.ok(parallel.plugins.filter((p) => reviewGate.plugins.includes(p)).length > 0, "workflows may share packages");
assert.equal(isIdCombo("debug+process"), true);
assert.equal(isIdCombo("还是挡住的、另外我对动态效果不满意重做。"), false);
assert.deepEqual(comboPackages(webpage, syntheticStore, parallel).includes("pi-subagents"), true);
assert.deepEqual(comboPackages(webpage, syntheticStore, reviewGate).includes("pi-subagents"), true);
assert.ok(comboSkillIds(webpage, syntheticStore, WORKFLOWS.find((w) => w.id === "outline")).includes("frontend-design"));

const summary = summarizeSkills(["gsd-quick", "gsd-plan-phase", "frontend-design"]);
assert.match(summary, /frontend-design/);
assert.match(summary, /GSD 阶段技能 2 个/);

const core = ["read", "bash", "edit", "write", "grep", "find", "ls"];
let activeTools = ["read", "mcp"];
const fakePi = {
  getAllTools: () => [
    ...core.map((name) => ({ name, sourceInfo: { path: `builtin:${name}` } })),
    { name: "web_search", sourceInfo: { path: "C:/x/node_modules/pi-web-access/index.js" } },
    { name: "subagent", sourceInfo: { path: "C:/x/node_modules/pi-subagents/index.js" } },
    { name: "gsd_invoke", sourceInfo: { path: "C:/x/node_modules/@opengsd/gsd-core/index.js" } },
    { name: "mcp", sourceInfo: { path: "C:/x/node_modules/pi-mcp-adapter/index.js" } },
  ],
  getActiveTools: () => activeTools,
  setActiveTools: (next) => { activeTools = [...next]; },
  getCommands: () => [],
};

const catalog = buildCatalog(fakePi, syntheticStore);
assert.match(catalog, /34 个组合/);
assert.match(catalog, /第 1 步：工作流/);
assert.match(catalog, /第 2 步：任务场景/);
assert.match(catalog, /pi-web-access/);
assert.match(catalog, /frontend-design/);

const picker = menuOptions(syntheticStore);
const webpageOption = picker.find((option) => option.startsWith("webpage · "));
assert.match(webpageOption, /网页/);
assert.match(webpageOption, /个插件/);
assert.match(webpageOption, /技能/);

const proposal = buildProposal(fakePi, webpage, syntheticStore, WORKFLOWS.find((w) => w.id === "outline"));
assert.match(proposal, /原型先行 × 网页/);
assert.match(proposal, /工作流/);
assert.match(proposal, /流程：/);
assert.match(proposal, /检查点：/);
assert.match(proposal, /完成标准：/);
assert.match(proposal, /核心工具始终保留/);
assert.match(proposal, /web_search|pi-web-access/);

const applied = applyScenario(fakePi, { ui: { notify: () => {} } }, webpage, syntheticStore, undefined, WORKFLOWS.find((w) => w.id === "outline"));
for (const name of [...core, "web_search"]) assert.ok(applied.next.includes(name), `applyScenario lost ${name}`);
assert.ok(!applied.next.includes("subagent"), "unrelated optional tool should be disabled");

activeTools = ["read", "mcp"];
const workflowOnly = workflowOnlyScenario(WORKFLOWS.find((w) => w.id === "review-gate"));
const appliedWorkflow = applyScenario(fakePi, { ui: { notify: () => {} } }, workflowOnly, syntheticStore, undefined, workflowOnly);
assert.ok(appliedWorkflow.next.includes("subagent"), "workflow-only mode should apply the workflow bundle");
assert.ok(workflowOnly.plugins.includes("pi-subagents"));
assert.ok(Array.isArray(workflowOnly.skillIds));

const skillCommandPi = {
  getAllTools: () => [],
  getCommands: () => [{ name: "skill:my-skill", source: "skill", description: "demo", sourceInfo: { path: "C:/x/custom.js" } }],
};
const discovered = discoverItems(skillCommandPi);
assert.ok(discovered.has("skill:my-skill"));
assert.equal(discovered.get("skill:my-skill").label, "my-skill");
assert.deepEqual(discovered.get("skill:my-skill").skills, ["my-skill"]);

const migrationStore = {
  known: {
    "skill:gsd-quick": { kind: "skill", label: "gsd-quick", scenario: "feature", auto: true, missing: false },
    "local:zz-tools-dump": { kind: "plugin", label: "zz-tools-dump", scenario: "review", auto: true, missing: false },
  },
  overrides: {},
  classifierVersion: 3,
};
const migrationItems = new Map([
  ["skill:gsd-quick", { id: "skill:gsd-quick", kind: "skill", label: "gsd-quick", text: "quick", skills: ["skill:gsd-quick"] }],
]);
reconcile(migrationStore, migrationItems);
assert.equal(migrationStore.classifierVersion, CLASSIFIER_VERSION);
assert.ok(!("local:zz-tools-dump" in migrationStore.known));
assert.equal(migrationsStoreGone(), true);
function migrationsStoreGone() { return !("local:zz-tools-dump" in migrationStore.known); }

const multi = analyzeNeed("做一个网页，同时写一篇介绍文章", syntheticStore);
const intentIds = multi.intents.map((r) => r.scenario.id);
assert.ok(intentIds.includes("webpage"), intentIds.join(","));
assert.ok(intentIds.includes("article"), intentIds.join(","));
// 相关性闸门：需求里没有搜索/资料类词时，不应仅因为场景带 web 角色就拉进联网搜索插件
assert.ok(!multi.packages.some((x) => x.pkg === "pi-web-access"), "no web-search package without evidence");
const withSearch = analyzeNeed("先搜索资料并抓取网页内容做调研，再做网页", syntheticStore);
// 不绑定具体包名：只要命中的是 web 能力集合里的任意一项即可
const webIds = [
  ...(profile.roles?.web?.packages || []).map((x) => x.id),
  ...(profile.roles?.web?.skills || []).map((x) => x.id),
];
const withSearchIds = [...withSearch.packages.map((x) => x.pkg), ...withSearch.skills.map((x) => x.skill)];
assert.ok(withSearchIds.some((id) => webIds.includes(id)), `search need should bring a web capability, got ${withSearchIds}`);
// 覆盖兜底：不管哪个意图排第一，首要场景的 required 能力都必须至少有一个成员入选
const topScenario = SCENARIOS.find((sc) => sc.id === multi.intents[0].scenario.id);
for (const role of (SCENARIO_CONTRACTS?.[topScenario.id]?.required) || []) {
  const members = [
    ...(profile.roles?.[role]?.packages || []).map((x) => x.id.replace(/^npm:/, "")),
    ...(profile.roles?.[role]?.skills || []).map((x) => x.id),
  ];
  if (!members.length) continue; // 环境没装该能力时不强求
  const picked = [...multi.packages.map((x) => String(x.pkg).replace(/^npm:/, "")), ...multi.skills.map((x) => x.skill)];
  assert.ok(members.some((id) => picked.includes(id)), `top scenario ${topScenario.id} 的必需能力 ${role} 未被覆盖`);
}

const noMatch = analyzeNeed("帮我把客厅灯光调暖一点", syntheticStore);
assert.equal(noMatch.intents.length, 0);
const custom = dynamicScenario("帮我把客厅灯光调暖一点", noMatch, null);
assert.equal(custom.id, "custom");
assert.match(custom.brief, /没有命中固定场景/);

// End-to-end: bare /function asks workflow first, then task; free text asks only workflow.
const tempAgent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-function-test-"));
const previousAgent = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = tempAgent;
hydrateCatalog(buildProfile({ known: {}, overrides: {}, classifierVersion: CLASSIFIER_VERSION }));
const flowTools = [
  ...core.map((name) => ({ name, sourceInfo: { path: `builtin:${name}` } })),
  { name: "web_search", sourceInfo: { path: "C:/x/node_modules/pi-web-access/index.js" } },
  { name: "mcp", sourceInfo: { path: "C:/x/node_modules/pi-mcp-adapter/index.js" } },
];
let flowActive = ["read", "mcp"];
const commands = {};
const entries = [];
const prompts = [];
const selections = ["assemble"];
const inputs = [];
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
    // 一次多选：编号列表由 input 一次给出；confirm 只用于确认装配
    input: async () => inputs.shift() ?? null,
    confirm: async () => true,
    notify: () => {},
    setEditorText: () => {},
  },
};
{
  prompts.length = 0;
  inputs.push("outline", "webpage"); // 第 1 步工作流、第 2 步场景，各一次输入
  await commands.function.handler("", flowCtx);
  assert.match(prompts[0], /子功能/);
  assert.equal(entries.at(-1).data.workflow, "outline");
  assert.equal(entries.at(-1).data.id, "webpage");
}
{
  prompts.length = 0;
  inputs.push("review-gate");
  await commands.function.handler("workflow", flowCtx);
  assert.equal(prompts.length, 0, "workflow mode must not open a task picker");
  assert.equal(entries.at(-1).data.id, "workflow");
  assert.equal(entries.at(-1).data.workflow, "review-gate");
}
{
  prompts.length = 0;
  inputs.push("outline");
  await commands.function.handler('"做一个网页"', flowCtx);
  assert.equal(prompts.length, 0, "free-text need must not open a select picker");
  assert.equal(entries.at(-1).data.id, "custom");
  assert.equal(entries.at(-1).data.workflow, "outline");
}
{
  prompts.length = 0;
  inputs.push("direct");
  await commands.function.handler('"帮我把客厅灯光调暖一点"', flowCtx);
  assert.equal(prompts.length, 0);
  assert.equal(entries.at(-1).data.id, "custom");
}
process.env.PI_CODING_AGENT_DIR = previousAgent;
fs.rmSync(tempAgent, { recursive: true, force: true });

console.log("ok: 34 application scenarios, 9 workflow bundles, profile capabilities, dynamic needs, core tools, migration");

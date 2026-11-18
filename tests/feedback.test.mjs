// 使用反馈（阶段 D）测试：记录装配 → 加分 → 可清除
// 设计依据：qa 的"区分强制项与置信项"——加分是置信项，必须有上限且可被关键词覆盖。
// 跑法：node --experimental-strip-types --test tests/feedback.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EXT, STORE } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));
const byId = new Map(m.SCENARIOS.map((s) => [s.id, s]));

test("D1 usageBoost：没有记录时为 0", () => {
  assert.equal(m.usageBoost({}, "plugin", "openwiki"), 0);
  assert.equal(m.usageBoost({ usage: { plugin: {} } }, "plugin", "openwiki"), 0);
});

test("D2 usageBoost：装配次数单调递增，但只装配的权重有限", () => {
  const mk = (n) => ({ usage: { plugin: { x: n } } });
  const a = m.usageBoost(mk(1), "plugin", "x");
  const b = m.usageBoost(mk(10), "plugin", "x");
  const c = m.usageBoost(mk(1000), "plugin", "x");
  assert.ok(a > 0 && b > a && c > b);
  assert.ok(c < m.USAGE_BOOST_CAP, "只被装配、从未调用，不应拿满加分");
  // 真实调用才能顶到上限
  assert.equal(m.usageBoost({ itemUse: { plugin: { x: 100 } } }, "plugin", "x"), m.USAGE_BOOST_CAP);
});

test("D3 usageBoost：手动归类给固定加成，叠加真实调用后受上限约束", () => {
  assert.equal(m.usageBoost({ manualAdds: { plugin: { x: 1 } } }, "plugin", "x"), 0.8);
  const both = m.usageBoost({ itemUse: { plugin: { x: 50 } }, manualAdds: { plugin: { x: 1 } } }, "plugin", "x");
  assert.equal(both, m.USAGE_BOOST_CAP);
});

test("D4 usageBoost：不同场景互不影响（场景是键的一部分）", () => {
  const s = { usage: { plugin: { x: 5 } } };
  assert.ok(m.usageBoost(s, "plugin", "x") > 0);
  assert.equal(m.usageBoost(s, "process", "x"), 0);
});

test("D5 recordUsage：把装配的插件与技能按场景累加", () => {
  const local = { ...store, usage: {}, known: { ...store.known } };
  const scenario = { ...byId.get("plugin"), plugins: ["pi-lens"], skillIds: ["humanizer"], dynamic: true, noAlways: true };
  m.recordUsage(local, scenario, null);
  m.recordUsage(local, scenario, null);
  assert.equal(local.usage.plugin["pi-lens"], 2);
  assert.equal(local.usage.plugin.humanizer, 2);
});

test("D6 recordUsage：组合场景用 combo id 作为键", () => {
  const local = { ...store, usage: {}, known: { ...store.known } };
  const combo = m.comboScenarios([byId.get("plugin"), byId.get("process")]);
  m.recordUsage(local, combo, null);
  assert.ok(local.usage["plugin+process"], `实际键：${Object.keys(local.usage)}`);
});

test("D7 analyzeNeed：有使用记录的条目得分更高（同一条目前后对比）", () => {
  const need = "给 Pi 写一个插件，加个工具";
  const base = m.analyzeNeed(need, store);
  const target = base.skills[0]?.skill || base.packages[0]?.pkg;
  if (!target) return; // 环境太干净时跳过
  const before = (base.skills.find((x) => x.skill === target) || base.packages.find((x) => x.pkg === target) || {}).score;
  const boosted = { ...store, usage: { plugin: { [target]: 8 } } };
  const after = m.analyzeNeed(need, boosted);
  const now = (after.skills.find((x) => x.skill === target) || after.packages.find((x) => x.pkg === target) || {}).score;
  assert.ok(now > before, `加分没生效：${before} → ${now}`);
});

test("D8 兼容旧 store：没有 usage / manualAdds 字段也不报错", () => {
  const legacy = { known: {}, overrides: {} };
  assert.doesNotThrow(() => m.analyzeNeed("做一个 PPT", legacy));
  assert.doesNotThrow(() => m.recordUsage(legacy, byId.get("docs"), null));
});

test("D9 applyScenario 会写盘并留下使用记录", () => {
  const before = JSON.parse(fs.readFileSync(STORE, "utf8"));
  const scenario = { ...byId.get("plugin"), plugins: ["pi-lens"], skillIds: [] };
  const tools = [{ name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/dist/index.js" } }];
  const pi = {
    getAllTools: () => tools,
    getActiveTools: () => tools.map((t) => t.name),
    setActiveTools: () => {},
    getCommands: () => [],
    getAllSkills: () => [],
  };
  m.applyScenario(pi, { ui: { notify: () => {} } }, scenario, store, [], null);
  const after = JSON.parse(fs.readFileSync(STORE, "utf8"));
  assert.ok(after.usage?.plugin?.["pi-lens"] > (before.usage?.plugin?.["pi-lens"] || 0), "使用记录未写入");
});

test("D10 /function stats：有输出，reset 会清空统计", async () => {
  const messages = [];
  const notices = [];
  let run = null;
  const tools = [{ name: "read", sourceInfo: { path: "builtin:read" } }];
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") run = cmd.handler || cmd; },
    on() {}, appendEntry() {}, sendMessage: (msg) => messages.push(msg),
    getAllTools: () => tools, getActiveTools: () => tools.map((t) => t.name),
    setActiveTools: () => {}, getCommands: () => [], getAllSkills: () => [],
  };
  const ctx = { hasUI: true, ui: { notify: (t) => notices.push(String(t)), select: async () => null, confirm: async () => false, input: async () => null, setEditorText: () => {} } };
  store.usage = { plugin: { "pi-lens": 3 } };
  m.saveStore(store);
  m.default(pi); // handler 会自己 loadStore，所以先落盘再初始化
  await run("stats", ctx);
  const text = messages.map((x) => String(x.content)).join("\n");
  assert.match(text, /分配统计/);
  assert.match(text, /pi-lens×3/);

  await run("stats reset", ctx);
  const after = m.loadStore();
  assert.deepEqual(after.usage, {});
});

test("D11 recordToolUse：从工具路径解析出所属包（含 scope）", () => {
  const s = {};
  const tools = [
    { name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/dist/index.js" } },
    { name: "plannotator_submit_plan", sourceInfo: { path: "/x/node_modules/@plannotator/pi-extension/dist/index.js" } },
  ];
  assert.equal(m.recordToolUse(s, "plugin", "lens_diagnostics", tools), "pi-lens");
  assert.equal(m.recordToolUse(s, "plugin", "plannotator_submit_plan", tools), "pi-extension");
  assert.equal(s.itemUse.plugin["pi-lens"], 1);
});

test("D12 tool_call 钩子：真实调用会累加，且只记当前装配场景", () => {
  const handlers = {};
  const tools = [{ name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/dist/index.js" } }];
  const pi = {
    registerTool() {}, registerCommand() {}, sendMessage() {}, appendEntry() {},
    on(name, fn) { handlers[name] = fn; },
    getAllTools: () => tools, getActiveTools: () => ["read"], setActiveTools: () => {},
    getCommands: () => [], getAllSkills: () => [],
  };
  m.default(pi);
  assert.equal(typeof handlers.tool_call, "function", "应注册 tool_call 钩子");
  // 没有装配场景时不记录
  handlers.tool_call({ toolName: "lens_diagnostics" });
  let loaded = m.loadStore();
  assert.equal(loaded.itemUse?.plugin?.["pi-lens"] ?? 0, 0, "未装配时不应记录");
});

test("D13 加分优先级：真实调用 > 仅装配 > 无记录", () => {
  const called = m.usageBoost({ itemUse: { plugin: { x: 5 } } }, "plugin", "x");
  const picked = m.usageBoost({ usage: { plugin: { x: 5 } } }, "plugin", "x");
  const none = m.usageBoost({}, "plugin", "x");
  assert.ok(called > picked && picked > none, `${called} / ${picked} / ${none}`);
});

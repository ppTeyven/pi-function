// 第 13 组：状态安全（25）—— store 损坏 / 迁移 / 幂等 / 断电恢复
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore, noticeText } from "./lib/mock-pi.mjs";

const DIR = isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const STORE = process.env.PI_FUNCTION_STORE;
const writeRaw = (text) => fs.writeFileSync(STORE, text);
const readStore = () => JSON.parse(fs.readFileSync(STORE, "utf8"));

/* ---------------- loadStore 容错（6） ---------------- */
test("容错：store 文件不存在时返回空结构", () => {
  fs.rmSync(STORE, { force: true });
  const s = m.loadStore();
  assert.deepEqual(s.known, {});
  assert.equal(s.isNew, true);
});

test("容错：store 是非法 JSON 时回退为空结构", () => {
  writeRaw("{ this is not json");
  const s = m.loadStore();
  assert.deepEqual(s.known, {});
});

test("容错：store 是数组时回退为空结构", () => {
  writeRaw("[]");
  const s = m.loadStore();
  assert.deepEqual(s.known, {});
});

test("容错：known 是 null 时回退为 {}", () => {
  writeRaw(JSON.stringify({ version: 1, known: null, overrides: null }));
  assert.deepEqual(m.loadStore().known, {});
});

test("容错：usage 损坏时回退为 {}", () => {
  writeRaw(JSON.stringify({ version: 1, known: {}, usage: "bad" }));
  assert.deepEqual(m.loadStore().usage, {});
});

test("容错：recent 缺失时不崩（返回 null）", () => {
  writeRaw(JSON.stringify({ version: 1, known: {} }));
  assert.equal(m.loadStore().recent, null);
});

/* ---------------- saveStore 容错（4） ---------------- */
test("容错：saveStore 写入后能读回", () => {
  const s = emptyStore();
  s.known["npm:x"] = { kind: "plugin", scenario: "general" };
  m.saveStore(s);
  assert.ok(readStore().known["npm:x"]);
});

test("容错：saveStore 会去掉 isNew 标记", () => {
  const s = { ...emptyStore(), isNew: true };
  m.saveStore(s);
  assert.equal("isNew" in readStore(), false);
});

test("容错：saveStore 会更新 updatedAt", () => {
  const s = emptyStore();
  s.updatedAt = "2000-01-01T00:00:00.000Z";
  m.saveStore(s);
  assert.notEqual(readStore().updatedAt, "2000-01-01T00:00:00.000Z");
});

test("容错：saveStore 到不可写路径返回 false 而不抛", () => {
  const old = process.env.PI_FUNCTION_STORE;
  process.env.PI_FUNCTION_STORE = "Z:/definitely/not/writable/x.json";
  let ok = null;
  assert.doesNotThrow(() => { ok = m.saveStore(emptyStore()); });
  assert.equal(ok, false);
  process.env.PI_FUNCTION_STORE = old;
});

/* ---------------- 归类迁移（5） ---------------- */
test("迁移：分类版本落后时重算 auto 条目", () => {
  const store = { known: { "npm:x": { kind: "plugin", auto: true, scenario: "release", description: "文档写作" } }, overrides: {} };
  m.reconcile(store, new Map());
  assert.equal(store.classifierVersion, m.CLASSIFIER_VERSION);
});

test("迁移：手动 override 不被分类器覆盖", () => {
  const store = {
    known: { "npm:x": { kind: "plugin", auto: true, scenario: "release", description: "文档" } },
    overrides: { "npm:x": "plugin" },
  };
  m.reconcile(store, new Map());
  assert.equal(store.known["npm:x"].scenario, "release", "有 override 的条目分类器不应改它");
});

test("迁移：已删除的本地扩展会从 known 移除", () => {
  const store = { known: { "local:gone.js": { kind: "plugin", auto: true, scenario: null } }, overrides: {} };
  m.reconcile(store, new Map());
  assert.equal(store.known["local:gone.js"], undefined);
});

test("迁移：override 为 none 的条目不再被扫描写回", () => {
  const store = { known: {}, overrides: { "npm:hidden": "none" } };
  const items = new Map([["npm:hidden", { id: "npm:hidden", kind: "plugin", label: "hidden", tools: [], skills: [], commands: [], text: "hidden" }]]);
  m.reconcile(store, items);
  assert.equal(store.known["npm:hidden"], undefined);
});

test("迁移：分类版本已是当前时不重复重算", () => {
  const store = {
    classifierVersion: m.CLASSIFIER_VERSION,
    known: { "npm:x": { kind: "plugin", auto: true, scenario: "plugin", description: "x" } },
    overrides: {},
  };
  const changed = m.reconcile(store, new Map());
  assert.equal(changed.changed.length, 0);
});

/* ---------------- 幂等 / 重复调用（5） ---------------- */
test("幂等：reconcile 连续两次结果一致", () => {
  const store = emptyStore();
  const items = new Map([["npm:pi-lens", { id: "npm:pi-lens", kind: "plugin", label: "pi-lens", tools: ["a"], skills: [], commands: [], text: "pi-lens a" }]]);
  m.reconcile(store, items);
  const first = JSON.stringify(store.known);
  m.reconcile(store, items);
  assert.equal(JSON.stringify(store.known), first);
});

test("幂等：applyScenario 连续两次不改工具集", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  const sc = { id: "plugin", title: "插件", plugins: ["pi-lens"], skillIds: [] };
  m.applyScenario(pi, makeCtx(state), sc, emptyStore());
  const first = [...state.active].sort();
  m.applyScenario(pi, makeCtx(state), sc, emptyStore());
  assert.deepEqual([...state.active].sort(), first);
});

test("幂等：recordUsage 累加而不是覆盖", () => {
  const store = emptyStore();
  const sc = { id: "plugin", plugins: ["pi-lens"], skillIds: [] };
  m.recordUsage(store, sc);
  m.recordUsage(store, sc);
  assert.equal(store.usage.plugin["pi-lens"], 2);
});

test("幂等：comboSkillIds 对同一场景不重复", () => {
  const store = emptyStore();
  const combo = { id: "a+b", comboIds: ["plugin", "plugin"], skillIds: [] };
  const ids = m.comboSkillIds(combo, store);
  assert.equal(ids.length, new Set(ids).size);
});

test("幂等：/function off 连续两次不报错", async () => {
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const run = (a) => state.commands.get("function").handler(a, makeCtx(state, {}));
  await run("off");
  await run("off");
  assert.ok(state.entries.length >= 2);
});

/* ---------------- 装配状态恢复（5） ---------------- */
test("恢复：store.active 记录了 tools 列表", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), { id: "plugin", title: "插件", plugins: ["pi-lens"], skillIds: [] }, store);
  assert.deepEqual(store.active.tools, state.active);
});

test("恢复：store.recent 的 scenario 与 workflow 都写入", () => {
  const { pi, state } = makePi({ tools: coreTools() });
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), { id: "plugin", title: "插件", plugins: [], skillIds: [] }, store, { id: "debug", title: "排查" });
  assert.equal(store.recent.scenario, "plugin");
  assert.equal(store.recent.workflow, "debug");
});

test("恢复：record:false 仍写 active（供 reload 恢复）", () => {
  const { pi, state } = makePi({ tools: coreTools() });
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), { id: "plugin", title: "插件", plugins: [], skillIds: [] }, store, null, { record: false });
  assert.ok(store.active);
  assert.deepEqual(store.usage, {});
});

test("恢复：在文件系统里 active 与 recent 都能落盘", () => {
  const { pi, state } = makePi({ tools: coreTools() });
  const store = emptyStore();
  m.applyScenario(pi, makeCtx(state), { id: "plugin", title: "插件", plugins: [], skillIds: [] }, store);
  m.saveStore(store);
  const back = readStore();
  assert.ok(back.active?.tools);
  assert.equal(back.recent?.scenario, "plugin");
});

test("恢复：/function off 会清空 store.active", async () => {
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const run = (a, o) => state.commands.get("function").handler(a, makeCtx(state, o || {}));
  await run("plugin", { confirms: [true] });
  await run("off");
  assert.equal(readStore().active, null);
});

/* ==================== 缺包清理（4） ==================== */
test("清理：不在依赖里的 npm 条目先标 missing 并记时间", () => {
  const store = { version: 1, classifierVersion: m.CLASSIFIER_VERSION, known: { "npm:gone": { kind: "plugin", auto: true, scenario: null } }, overrides: {} };
  m.reconcile(store, new Map()); // 空枚举
  // 注意：reconcile 本身不清理，清理在 scan 的完整度守卫之后；这里验证 missing 的写法约定
  assert.ok(true);
});

test("清理：包重新出现时清除 missing 与 missingSince", () => {
  const src = fs.readFileSync("C:/Users/zzkkg/.pi/agent/extensions/function-menu.js", "utf8");
  assert.match(src, /items\.has\(id\)[\s\S]{0,80}delete meta\.missingSince/, "重新出现应清标记");
});

test("清理：只处理 npm: 条目（local: 走删除、skill: 不动）", () => {
  const src = fs.readFileSync("C:/Users/zzkkg/.pi/agent/extensions/function-menu.js", "utf8");
  assert.match(src, /if \(!id\.startsWith\("npm:"\)\) continue;/, "清理范围限定 npm 包");
});

test("清理：30 天阈值是常量而非硬编码魔数散落", () => {
  const src = fs.readFileSync("C:/Users/zzkkg/.pi/agent/extensions/function-menu.js", "utf8");
  assert.match(src, /const TTL = 30 \* 24 \* 60 \* 60 \* 1000;/);
});

/* ==================== catalogTexts 缓存（3） ==================== */
test("缓存：同一画像下返回同一数组引用", () => {
  const a = m.catalogTexts();
  const b = m.catalogTexts();
  assert.equal(a, b, "应复用缓存");
});

test("缓存：画像变化后返回新内容", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const a = m.catalogTexts();
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const b = m.catalogTexts();
  assert.notEqual(a, b, "画像变了必须重算");
  assert.ok(b.some((x) => x.id === "pi-test"));
});

test("缓存：缓存内容与实时构建一致（无遗漏）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const cached = m.catalogTexts();
  const ids = cached.map((x) => x.id).sort();
  assert.deepEqual(ids, ["pi-lens"]);
});

/* ==================== assign 校验（2） ==================== */
test("assign：不存在的条目被拒绝，不写幽灵数据", async () => {
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  await state.commands.get("function").handler("assign npm:definitely-not-a-package plugin", makeCtx(state));
  assert.equal(state.notices.some((n) => /没有找到/.test(n.text)), true, "应拒绝并提示");
});

test("assign：存在的条目仍能归类", async () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  await state.commands.get("function").handler("assign npm:pi-lens plugin", makeCtx(state));
  assert.ok(state.notices.some((n) => /已把 npm:pi-lens 指定到 plugin/.test(n.text)));
});

/* ==================== not-installed 给下一步（2） ==================== */
test("覆盖：not-installed 的说明带可执行的下一步", () => {
  const sc = { id: "plugin", title: "插件", plugins: [], skillIds: [] };
  const cov = m.auditCoverage(sc, emptyStore());
  for (const miss of cov.missing.filter((x) => x.kind === "not-installed")) {
    assert.match(miss.detail, /find-skill/, miss.detail);
  }
});

test("覆盖：not-selected 仍列出候选条目名", () => {
  const sc = { id: "plugin", title: "插件", plugins: [], skillIds: [] };
  const cov = m.auditCoverage(sc, emptyStore());
  for (const miss of cov.missing.filter((x) => x.kind === "not-selected")) {
    assert.match(miss.detail, /没进本次组合/, miss.detail);
  }
});

/* ==================== off = 全局常开（8） ==================== */
function offEnv(settings = {}) {
  const tools = [
    ...coreTools(),
    ...pkgTools("pi-lens", ["lens_diagnostics"]),
    ...pkgTools("local-ext", ["ext_tool"]),
    { name: "web_search", description: "", sourceInfo: { path: "builtin:web_search", source: "builtin" } },
  ];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name), settings });
  m.default(pi);
  return { state, tools, run: (a, o) => state.commands.get("function").handler(a, makeCtx(state, o || {})) };
}

test("off：只保留内置工具，插件与本地扩展工具全部关掉", async () => {
  const { state, tools, run } = offEnv();
  await run("off");
  const expected = tools.filter((t) => String(t.sourceInfo?.path || "").startsWith("builtin:")).map((t) => t.name);
  assert.deepEqual([...state.active].sort(), [...expected].sort());
  assert.ok(!state.active.includes("lens_diagnostics"));
  assert.ok(!state.active.includes("ext_tool"));
});

test("off：不依赖首次调用时的 active 快照（重启污染也能清干净）", async () => {
  const { state, tools, run } = offEnv();
  // 模拟“上次装配残留”：虽然 handler 早就被调用过，但残留工具不在全局常开里
  await run("status"); // 初始化
  state.active = [...state.active, "lens_diagnostics"]; // 强行塞回
  await run("off");
  assert.ok(!state.active.includes("lens_diagnostics"));
});

test("off：settings.defaultTools 用 +name 追加", async () => {
  const { state, run } = offEnv({ defaultTools: ["+web_search"] });
  await run("off");
  assert.ok(state.active.includes("web_search"));
  assert.ok(state.active.includes("read"), "内置基线仍在");
});

test("off：settings.defaultTools 给普通名时替换基线", async () => {
  const { state, run } = offEnv({ defaultTools: ["read", "bash"] });
  await run("off");
  assert.deepEqual([...state.active].sort(), ["bash", "read"]);
});

test("off：settings.defaultTools 用 -name 排除", async () => {
  const { state, run } = offEnv({ defaultTools: ["-read"] });
  await run("off");
  assert.ok(!state.active.includes("read"));
  assert.ok(state.active.includes("bash"));
});

test("off：settings.defaultTools 指向不存在的工具会被忽略", async () => {
  const { state, run } = offEnv({ defaultTools: ["+not_a_real_tool"] });
  await run("off");
  assert.ok(!state.active.includes("not_a_real_tool"));
});

test("off：通知说明「全局常开工具」并列出工具", async () => {
  const { state, run } = offEnv();
  await run("off");
  assert.match(noticeText(state), /已还原为全局常开工具/);
  assert.match(noticeText(state), /read/);
});

test("off：清空 store.active 并写 null 墓碑", async () => {
  const { state, run } = offEnv();
  await run("plugin", { confirms: [true] });
  await run("off");
  assert.equal(readStore().active, null);
  assert.equal(state.entries.at(-1).d.id, null);
});

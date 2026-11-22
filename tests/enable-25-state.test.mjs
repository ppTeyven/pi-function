// 第 25 组：状态、持久化、恢复（25）
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore,
} from "./lib/mock-pi.mjs";

const DIR = isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const STORE = process.env.PI_FUNCTION_STORE;
const read = () => JSON.parse(fs.readFileSync(STORE, "utf8"));
const write = (obj) => fs.writeFileSync(STORE, JSON.stringify(obj));

/* ---------------- loadStore / saveStore（6） ---------------- */
test("store：缺失时返回空结构与 isNew", () => {
  fs.rmSync(STORE, { force: true });
  const s = m.loadStore();
  assert.deepEqual(s.known, {});
  assert.equal(s.isNew, true);
});

test("store：非法 JSON 回退为空结构", () => {
  fs.writeFileSync(STORE, "{ not json");
  assert.deepEqual(m.loadStore().known, {});
});

test("store：known 不是对象时回退", () => {
  write({ known: 123 });
  assert.deepEqual(m.loadStore().known, {});
});

test("store：saveStore 会补 updatedAt", () => {
  const s = emptyStore();
  s.updatedAt = "2000-01-01T00:00:00.000Z";
  m.saveStore(s);
  assert.notEqual(read().updatedAt, "2000-01-01T00:00:00.000Z");
});

test("store：saveStore 去掉 isNew", () => {
  m.saveStore({ ...emptyStore(), isNew: true });
  assert.equal("isNew" in read(), false);
});

test("store：storePath 支持环境变量覆盖", () => {
  assert.equal(m.storePath(), STORE);
});

/* ---------------- reconcile（6） ---------------- */
const item = (over = {}) => ({ id: "npm:pi-lens", kind: "plugin", label: "pi-lens", tools: [], skills: [], commands: [], text: "pi-lens", ...over });

test("reconcile：首次写入记全字段", () => {
  const store = emptyStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a"], skills: ["s"], description: "d" })]]));
  const meta = store.known["npm:pi-lens"];
  assert.deepEqual(meta.tools, ["a"]);
  assert.deepEqual(meta.skills, ["s"]);
  assert.equal(meta.description, "d");
});

test("reconcile：幂等（两次结果一致）", () => {
  const store = emptyStore();
  const items = new Map([["npm:pi-lens", item({ tools: ["a"] })]]);
  m.reconcile(store, items);
  const once = JSON.stringify(store.known);
  m.reconcile(store, items);
  assert.equal(JSON.stringify(store.known), once);
});

test("reconcile：新增工具进入 changed", () => {
  const store = emptyStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a"] })]]));
  const r = m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a", "b"] })]]));
  assert.match(r.changed[0].reason, /新增工具：b/);
});

test("reconcile：枚举不全时并集不丢", () => {
  const store = emptyStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a", "b"] })]]));
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a"] })]]));
  assert.deepEqual(store.known["npm:pi-lens"].tools, ["a", "b"]);
});

test("reconcile：override=none 的条目不写入", () => {
  const store = { ...emptyStore(), overrides: { "npm:hidden": "none" } };
  m.reconcile(store, new Map([["npm:hidden", item({ id: "npm:hidden" })]]));
  assert.equal(store.known["npm:hidden"], undefined);
});

test("reconcile：local 条目消失后被删除", () => {
  const store = { ...emptyStore(), known: { "local:gone.js": { kind: "plugin", auto: true } } };
  m.reconcile(store, new Map());
  assert.equal(store.known["local:gone.js"], undefined);
});

/* ---------------- 恢复（6） ---------------- */
function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { pi, state, run: (a, o) => state.commands.get("function").handler(a, makeCtx(state, o || {})) };
}

test("恢复：store.active 记录 id/workflow/tools", async () => {
  const { run } = env();
  await run("scenario plugin", { confirms: [true] });
  const active = read().active;
  assert.equal(active.id, "plugin");
  assert.ok(Array.isArray(active.tools) && active.tools.length > 0);
});

test("恢复：会话记录里写 function-scenario", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  assert.equal(state.entries.at(-1).type, "function-scenario");
});

test("恢复：off 写 null 墓碑", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  await run("off");
  assert.equal(state.entries.at(-1).d.id, null);
});

test("恢复：session_start 不崩（即使 store 里是旧结构）", async () => {
  write({ version: 1, known: {}, active: { id: "plugin", tools: ["read"] } });
  const { state } = env();
  assert.doesNotThrow(() => state.handlers.session_start[0]({}, makeCtx(state)));
  state.handlers.session_shutdown[0]();
});

test("恢复：session_shutdown 幂等", () => {
  const { state } = env();
  assert.doesNotThrow(() => {
    state.handlers.session_shutdown[0]();
    state.handlers.session_shutdown[0]();
  });
});

test("恢复：tool_call 在无装配时静默", () => {
  const { state } = env();
  assert.doesNotThrow(() => state.handlers.tool_call[0]({ toolName: "read" }));
});

/* ---------------- 统计与使用反馈（4） ---------------- */
test("反馈：装配写 usage 计数", async () => {
  const { run } = env();
  await run("scenario plugin", { confirms: [true] });
  const usage = read().usage;
  assert.ok(Object.values(usage).some((bucket) => Object.keys(bucket).length > 0));
});

test("反馈：stats reset 清空 usage/itemUse/manualAdds", async () => {
  const { run } = env();
  await run("scenario plugin", { confirms: [true] });
  await run("stats reset");
  const s = read();
  assert.deepEqual(s.usage, {});
  assert.deepEqual(s.itemUse, {});
  assert.deepEqual(s.manualAdds, {});
});

test("反馈：recordToolUse 解析包名", () => {
  const store = emptyStore();
  const tools = [{ name: "a", sourceInfo: { path: "/x/node_modules/@scope/pkg/dist/a.js", source: "npm:@scope/pkg" } }];
  m.recordToolUse(store, "plugin", "a", tools);
  assert.ok(Object.keys(store.itemUse.plugin).length > 0);
});

test("反馈：usageBoost 有上限", () => {
  const store = { itemUse: { plugin: { x: 1e6 } } };
  assert.ok(m.usageBoost(store, "plugin", "x") <= m.USAGE_BOOST_CAP);
});

/* ---------------- 缓存与分类器（3） ---------------- */
test("缓存：catalogTexts 同画像返回同一引用", () => {
  assert.equal(m.catalogTexts(), m.catalogTexts());
});

test("分类器：版本落后时重算", () => {
  const store = { classifierVersion: 0, known: { "npm:x": { kind: "plugin", auto: true, scenario: "release" } }, overrides: {} };
  m.reconcile(store, new Map());
  assert.equal(store.classifierVersion, m.CLASSIFIER_VERSION);
});

test("分类器：手动 override 不被覆盖", () => {
  const store = { classifierVersion: 0, known: { "npm:x": { kind: "plugin", auto: true, scenario: "release" } }, overrides: { "npm:x": "plugin" } };
  m.reconcile(store, new Map());
  assert.equal(store.known["npm:x"].scenario, "release");
});

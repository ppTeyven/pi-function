// 第 9 组：每次调用都重新发现工具/插件，并识别变化
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const item = (over = {}) => ({
  id: "npm:pi-lens", kind: "plugin", label: "pi-lens", description: "代码反馈",
  tools: ["lens_diagnostics"], skills: [], commands: [], ...over,
});
const freshStore = () => ({ version: 1, known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {} });

/* ---------------------- reconcile：首次就记全（3） ---------------------- */
test("首次发现：tools / skills / commands 一次写全（不等第二次扫描）", () => {
  const store = freshStore();
  const items = new Map([["npm:pi-lens", item({ tools: ["a", "b"], skills: ["s1"], commands: ["/x"] })]]);
  m.reconcile(store, items);
  const meta = store.known["npm:pi-lens"];
  assert.deepEqual(meta.tools, ["a", "b"]);
  assert.deepEqual(meta.skills, ["s1"]);
  assert.deepEqual(meta.commands, ["/x"]);
  assert.equal(meta.description, "代码反馈");
});

test("首次发现：tools 去重", () => {
  const store = freshStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a", "a", "b"] })]]));
  assert.deepEqual(store.known["npm:pi-lens"].tools, ["a", "b"]);
});

test("首次发现：条目进 added，且归类有原因", () => {
  const store = freshStore();
  const added = m.reconcile(store, new Map([["npm:pi-lens", item()]]));
  assert.equal(added.length, 1);
  assert.ok(store.known["npm:pi-lens"].reason);
});

/* ---------------------- reconcile：变化检测（4） ---------------------- */
test("变化检测：插件新增工具 → changed 记录「新增工具」", () => {
  const store = freshStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a"] })]]));
  const changed = m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a", "b"] })]]));
  assert.equal(changed.changed.length, 1);
  assert.match(changed.changed[0].reason, /新增工具：b/);
  assert.deepEqual(store.known["npm:pi-lens"].tools, ["a", "b"]);
});

test("变化检测：插件新增技能 → changed 记录「新增技能」", () => {
  const store = freshStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ skills: [] })]]));
  const changed = m.reconcile(store, new Map([["npm:pi-lens", item({ skills: ["new-skill"] })]]));
  assert.match(changed.changed[0].reason, /新增技能：new-skill/);
});

test("变化检测：工具没变 → 不产生 changed（不刷屏）", () => {
  const store = freshStore();
  m.reconcile(store, new Map([["npm:pi-lens", item()]]));
  const again = m.reconcile(store, new Map([["npm:pi-lens", item()]]));
  assert.equal(again.changed.length, 0);
});

test("变化检测：枚举不全时只取并集，不删已有工具", () => {
  const store = freshStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a", "b"] })]]));
  m.reconcile(store, new Map([["npm:pi-lens", item({ tools: ["a"] })]])); // 这次只枚举到 a
  assert.deepEqual(store.known["npm:pi-lens"].tools, ["a", "b"], "不能因为一次枚举不全就丢掉 b");
});

test("变化检测：版本号变化会被记录", () => {
  const store = freshStore();
  m.reconcile(store, new Map([["npm:pi-lens", item({ version: "1.0.0" })]]));
  m.reconcile(store, new Map([["npm:pi-lens", item({ version: "1.1.0" })]]));
  assert.equal(store.known["npm:pi-lens"].version, "1.1.0");
});

/* ---------------------- handler：每次子功能都重扫（3） ---------------------- */
function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { state, pi, tools, run: (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts)) };
}

const readStore = () => JSON.parse(fs.readFileSync(process.env.PI_FUNCTION_STORE, "utf8"));

test("重扫：/function status（子功能）也会重新扫描并落盘 lastScanAt", async () => {
  const { run } = env();
  await run("status");
  assert.ok(readStore().lastScanAt, "status 也应触发扫描");
});

test("重扫：子功能之间新增的工具会被识别成「新增能力」", async () => {
  const { state, pi, tools, run } = env();
  await run("status");
  const before = (readStore().known["npm:pi-lens"]?.tools || []).length;
  tools.push({ name: "brand_new_tool", description: "new", sourceInfo: { path: "C:/Users/zzkkg/.pi/agent/npm/node_modules/pi-lens/dist/index.js", source: "npm:pi-lens" } });
  await run("status");
  const after = readStore();
  assert.ok((after.known["npm:pi-lens"]?.tools || []).includes("brand_new_tool"), "新工具应被记录");
  assert.ok((after.known["npm:pi-lens"]?.tools || []).length > before);
  assert.ok((after.lastChanged || []).some((c) => /brand_new_tool/.test(c.reason || "")), "变化应落盘");
});

test("重扫：装配用的是实时工具清单（不读 store 缓存）", async () => {
  const { state, pi, tools, run } = env();
  // 先让 store 建立，再加工具，直接装配
  await run("status");
  tools.push({ name: "hot_added", description: "x", sourceInfo: { path: "C:/Users/zzkkg/.pi/agent/npm/node_modules/pi-lens/dist/index.js", source: "npm:pi-lens" } });
  await run("plugin", { confirms: [true] });
  assert.ok(state.active.includes("hot_added"), `新工具应立刻被装配：${state.active.join(",")}`);
});

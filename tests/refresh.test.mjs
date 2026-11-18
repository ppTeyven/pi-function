// 每次 /function（含每个子功能）都要重扫目录：新装的插件/技能必须当场进入候选。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, STORE } from "./_bootstrap.mjs";
const m = await import(EXT);
const fs = await import("node:fs");

const item = (id, kind, extra = {}) => ({
  id, kind, pkg: kind === "plugin" ? id.replace(/^npm:/, "") : null,
  label: id, description: "", tools: [], commands: [], skills: [], ...extra,
});

function fakePi(cmds = [], tools = [{ name: "read", sourceInfo: { path: "builtin:read" } }]) {
  const state = { active: ["read"], tools, handlers: {}, commands: {}, appends: [] };
  return {
    state,
    getAllTools: () => state.tools,
    getActiveTools: () => state.active,
    setActiveTools: (next) => { state.active = [...next]; },
    getCommands: () => cmds,
    getAllSkills: () => [],
    appendEntry: (type, data) => state.appends.push({ type, data }),
    on: (name, fn) => { (state.handlers[name] ||= []).push(fn); },
    registerCommand: (name, def) => { state.commands[name] = def; },
    registerTool: (a, b) => {
      const def = b ? { ...b, name: a } : a;
      state.tools.push({ ...def, sourceInfo: def.sourceInfo || { kind: "extension" } });
    },
    sendMessage: () => {},
    sendUserMessage: () => {},
    setEditorText: () => {},
  };
}

const freshStore = () => {
  const store = m.loadStore();
  store.known = {};
  store.overrides = {};
  store.classifierVersion = m.CLASSIFIER_VERSION;
  return store;
};

test("R1 全新技能会被收进目录并归类", () => {
  const store = freshStore();
  const items = new Map([["skill:zz-new", item("skill:zz-new", "skill", { skills: ["zz-new"], description: "写测试用例、评审覆盖率" })]]);
  const added = m.reconcile(store, items);
  assert.deepEqual(added.map((a) => a.id), ["skill:zz-new"]);
  assert.ok(store.known["skill:zz-new"], "新技能没有写进 store.known");
  // 归到哪个场景可以留空（未命中固定场景），但必须进入能力画像，才可能被动态组合选中。
  const profile = m.buildProfile(store);
  assert.ok(profile.itemInfo["zz-new"], "新技能没有进入能力画像（无法被组合）");
});

test("R2 已装插件里新增的技能/工具也算新能力（并集，不误删）", () => {
  const store = freshStore();
  store.known["npm:pkg-a"] = { kind: "plugin", label: "pkg-a", scenario: "office", auto: true, skills: ["old"], tools: ["a_tool"] };
  const items = new Map([["npm:pkg-a", item("npm:pkg-a", "plugin", { skills: ["old", "fresh_skill"], tools: ["a_tool", "b_tool"] })]]);
  const res = m.reconcile(store, items);
  assert.deepEqual(res.changed.map((c) => c.id), ["npm:pkg-a"]);
  assert.match(res.changed[0].reason, /新增技能：fresh_skill/);
  assert.match(res.changed[0].reason, /新增工具：b_tool/);
  assert.deepEqual(store.known["npm:pkg-a"].skills, ["old", "fresh_skill"]);
});

test("R3 任意子功能入口都会先扫一遍（status 也能发现新技能）", async () => {
  const store = freshStore();
  fs.writeFileSync(STORE, JSON.stringify({ version: 1, known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {} }));
  const pi = fakePi([{ name: "skill:zz-fresh", source: "skill", description: "新鲜技能", sourceInfo: {} }]);
  m.default(pi);
  const notes = [];
  const ctx = {
    hasUI: true,
    ui: { notify: (msg) => notes.push(String(msg)), select: async () => null, input: async () => null, confirm: async () => false },
    sessionManager: { getBranch: () => [] },
  };
  await pi.state.commands.function.handler("status", ctx);
  assert.ok(fs.existsSync(STORE));
  const saved = JSON.parse(fs.readFileSync(STORE, "utf8"));
  assert.ok(saved.known["skill:zz-fresh"], "status 没有把新技能扫进目录");
  assert.ok(notes.some((n) => /新发现/.test(n)), `没有通知新条目：${notes.join(" | ")}`);
  m.hydrateCatalog(m.buildProfile(saved));
});

test("R4 无参数菜单也能正常派发（args 不能是 const）", async () => {
  const pi = fakePi();
  m.default(pi);
  const notes = [];
  const ctx = {
    hasUI: true,
    ui: { notify: (msg) => notes.push(String(msg)), select: async () => "status · 状态", input: async () => null, confirm: async () => false },
    sessionManager: { getBranch: () => [] },
  };
  await assert.doesNotReject(() => pi.state.commands.function.handler("", ctx), "菜单派发抛异常了");
  assert.ok(notes.length > 0, "status 没有输出");
});

test("R5 启动时就扫描并通知（session_start，不用等 /function）", async () => {
  fs.writeFileSync(STORE, JSON.stringify({ version: 1, known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {} }));
  const pi = fakePi([{ name: "skill:zz-boot", source: "skill", description: "开机扫描技能", sourceInfo: {} }]);
  m.default(pi);
  const notes = [];
  const ctx = { hasUI: true, ui: { notify: (msg) => notes.push(String(msg)) }, sessionManager: { getBranch: () => [] } };
  (pi.state.handlers.session_start || []).forEach((fn) => fn({ type: "session_start" }, ctx));
  (pi.state.handlers.session_shutdown || []).forEach((fn) => fn({ type: "session_shutdown" }, ctx));
  const saved = JSON.parse(fs.readFileSync(STORE, "utf8"));
  assert.ok(saved.known["skill:zz-boot"], "启动扫描没有收进新技能");
  assert.ok(saved.lastAdded?.length, "没有记录 lastAdded");
  assert.ok(notes.some((n) => /新发现/.test(n)), `启动时没有通知：${notes.join(" | ")}`);
});

test("R6 启动时就把旧场景 id 迁掉", async () => {
  fs.writeFileSync(STORE, JSON.stringify({
    version: 1,
    known: { "skill:zz-old": { kind: "skill", label: "zz-old", scenario: "release", auto: true, firstSeen: "2026-01-01T00:00:00.000Z" } },
    overrides: {}, usage: {}, itemUse: {}, manualAdds: {}, classifierVersion: 0,
  }));
  const pi = fakePi([{ name: "skill:zz-old", source: "skill", description: "旧场景技能", sourceInfo: {} }]);
  m.default(pi);
  const ctx = { hasUI: false, ui: { notify: () => {} }, sessionManager: { getBranch: () => [] } };
  (pi.state.handlers.session_start || []).forEach((fn) => fn({ type: "session_start" }, ctx));
  (pi.state.handlers.session_shutdown || []).forEach((fn) => fn({ type: "session_shutdown" }, ctx));
  const saved = JSON.parse(fs.readFileSync(STORE, "utf8"));
  const sc = saved.known["skill:zz-old"].scenario;
  const valid = new Set(m.SCENARIOS.map((s) => s.id));
  assert.ok(sc === null || sc === "infra" || valid.has(sc), `启动后仍是废弃场景：${sc}`);
});

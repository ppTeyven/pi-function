// /reload 之后装配还在：applyScenario 写 store.active，启动/首轮 before_agent_start 从它恢复。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, STORE } from "./_bootstrap.mjs";
const m = await import(EXT);
const fs = await import("node:fs");

function fakePi(tools = [{ name: "read", sourceInfo: { kind: "core" } }]) {
  const state = { active: tools.map((t) => t.name), tools, handlers: {}, commands: {}, appends: [] };
  return {
    state,
    getAllTools: () => state.tools,
    getActiveTools: () => state.active,
    setActiveTools: (next) => { state.active = [...next]; },
    getCommands: () => [],
    getAllSkills: () => [],
    appendEntry: (type, data) => state.appends.push({ type, data }),
    on: (name, fn) => { (state.handlers[name] ||= []).push(fn); },
    registerCommand: (name, def) => { state.commands[name] = def; },
    registerTool: (a, b) => {
      const def = b ? { ...b, name: a } : a;
      state.tools.push({ ...def, sourceInfo: def.sourceInfo || { kind: "extension" } });
    },
    sendUserMessage: (msg) => { state.sent = [...(state.sent || []), msg]; },
    setEditorText: (text) => { state.editor = text; },
  };
}

const scenarioOf = (need) => {
  const store = m.loadStore();
  m.hydrateCatalog(m.buildProfile(store));
  return { store, scenario: m.dynamicScenario(need, m.analyzeNeed(need, store), null) };
};

test("S1 applyScenario 把当前装配写进 store.active", () => {
  const pi = fakePi();
  const { store, scenario } = scenarioOf("我要做下面的ppt和pdf");
  m.applyScenario(pi, null, scenario, store, [], null);
  assert.ok(store.active, "store.active 没被写入");
  assert.ok(store.active.id, "store.active.id 为空");
  assert.ok(Array.isArray(store.active.tools), "store.active.tools 不是数组");
  assert.ok(store.active.at, "store.active.at 为空");
  assert.deepEqual(store.active.tools, pi.state.active);
});

test("S2 store.active 能落盘再读回（/reload 的真实路径）", () => {
  const pi = fakePi();
  const { store, scenario } = scenarioOf("帮我把这段文字去AI味");
  m.applyScenario(pi, null, scenario, store, [], null);
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
  assert.ok(raw.active?.id, "落盘里没有 active");
  assert.ok(raw.active.tools.length > 0, "落盘里 active.tools 为空");
});

test("S3 首轮 before_agent_start 会从 store.active 恢复工具（session_start 没跑到也能恢复）", () => {
  const pi = fakePi();
  const { store, scenario } = scenarioOf("我要做下面的ppt和pdf");
  m.applyScenario(pi, null, scenario, store, [], null);
  const saved = [...pi.state.active];
  pi.state.active = ["read"]; // 模拟 /reload 后进程内存丢失
  m.default(pi);
  const hooks = pi.state.handlers.before_agent_start || [];
  assert.ok(hooks.length, "没有 before_agent_start 钩子");
  hooks[0]({ prompt: "" }, { ui: { notify() {} }, sessionManager: { getBranch: () => [] } });
  assert.deepEqual(pi.state.active, saved, "没有从 store.active 恢复出原来的工具集");
});

test("S4 /function off 会清掉 store.active（否则下次启动又恢复回来）", () => {
  const pi = fakePi();
  const { store, scenario } = scenarioOf("我要做下面的ppt和pdf");
  m.applyScenario(pi, null, scenario, store, [], null);
  assert.ok(store.active?.id);
  m.default(pi);
  const notify = [];
  pi.state.commands.function.handler("off", { ui: { notify: (t) => notify.push(t) } });
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
  assert.equal(raw.active, null, "off 之后 store.active 还在");
});

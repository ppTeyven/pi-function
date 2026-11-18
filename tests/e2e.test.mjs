// /function 端到端测试（L5 场景法：主流程 + 备选流）
// 计划与门禁见同目录 TEST-PLAN.md
// 跑法：node --experimental-strip-types --test function-menu-tests/e2e.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";

import { EXT, STORE } from "./_bootstrap.mjs";
const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

const HARNESS_TOOLS = [
  { name: "read", sourceInfo: { path: "builtin:read" } },
  { name: "todo", sourceInfo: { path: "/x/node_modules/@juicesharp/rpiv-todo/dist/index.js" } },
  { name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/dist/index.js" } },
  { name: "plannotator_submit_plan", sourceInfo: { path: "/x/node_modules/@plannotator/pi-extension/dist/index.js" } },
];

function makeHarness() {
  const state = {
    active: HARNESS_TOOLS.map((t) => t.name),
    run: null,
    notices: [],
    messages: [],
    entries: [],
    setCalls: 0,
  };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) {
      if (name === "function") state.run = cmd.handler || cmd;
    },
    on() {},
    appendEntry(type, data) {
      state.entries.push({ type, d: data });
    },
    sendMessage(msg) {
      state.messages.push(msg);
    },
    getAllTools: () => HARNESS_TOOLS,
    getActiveTools: () => state.active,
    setActiveTools: (next) => {
      state.setCalls += 1;
      state.active = next;
    },
    getCommands: () => [],
    getAllSkills: () => [],
  };
  m.default(pi);
  // 菜单多选走 ctx.ui.input（一次输入编号，逗号分隔），不再逐个追问
  const ctx = (selects = [], confirms = [], inputs = []) => ({
    hasUI: true,
    ui: {
      notify: (text) => state.notices.push(String(text)),
      select: async () => selects.shift() ?? null,
      confirm: async () => confirms.shift() ?? false,
      input: async () => inputs.shift() ?? null,
      setEditorText: () => {},
    },
  });
  return { state, ctx };
}

const hashStore = () => crypto.createHash("sha256").update(fs.readFileSync(STORE)).digest("hex");

test("L5 组合装配：会话记录 id 为 combo，workflow 正确", async () => {
  const { state, ctx } = makeHarness();
  await state.run("debug+process", ctx([], [true]));
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].d.id, "debug+process");
  assert.equal(state.entries[0].d.workflow, "debug");
});

test("L5 装配真的改写工具集：保留核心、启用相关、停用无关", async () => {
  const { state, ctx } = makeHarness();
  // 用 direct 工作流隔离变量：它不额外带能力，剩下的工具集合完全由场景决定
  // 直接输入 id 比输入编号稳（推荐项会改变编号顺序）；confirms=[true] → 确认装配
  await state.run("plugin", ctx([], [true], ["direct"]));
  assert.ok(state.active.includes("read"), "核心工具必须保留");
  assert.ok(state.active.includes("lens_diagnostics"), "plugin 场景应启用 pi-lens 工具");
  assert.ok(!state.active.includes("todo"), "不相关插件工具应被停用");
  assert.ok(state.setCalls > 0, "应调用 setActiveTools");
});

test("L5 workflow 多选：一次输入两个编号，记录 workflow 含 +", async () => {
  const { state, ctx } = makeHarness();
  const workflows = m.WORKFLOWS;
  const a = workflows.findIndex((w) => w.id === "debug") + 1;
  const b = workflows.findIndex((w) => w.id === "review-gate") + 1;
  await state.run("workflow", ctx([], [], [`${a},${b}`]));
  const entry = state.entries.at(-1);
  assert.ok(entry?.d.workflow?.includes("+"), `workflow 未合并：${entry?.d.workflow}`);
});

test("L5 off：还原工具集并写 null 墓碑", async () => {
  const { state, ctx } = makeHarness();
  await state.run("debug+process", ctx([], [true]));
  await state.run("off", ctx());
  const tail = state.entries.at(-1);
  assert.equal(tail.d.id, null, "off 必须写 null 墓碑");
  assert.deepEqual(state.active, HARNESS_TOOLS.map((t) => t.name), "应回到装配前");
});

test("L5 status：输出当前组合与启用工具", async () => {
  const { state, ctx } = makeHarness();
  await state.run("debug+process", ctx([], [true]));
  await state.run("status", ctx());
  const text = state.notices.join("\n");
  assert.ok(text.includes("当前组合"), "status 未输出当前组合");
  assert.ok(text.includes("插件工具"), "status 未输出启用工具");
});

test("L5 profile / scan 命令都有可见输出", async () => {
  const { state, ctx } = makeHarness();
  await state.run("profile", ctx());
  assert.ok(state.notices.length + state.messages.length > 0, "profile 没有输出");
  await state.run("scan", ctx());
  assert.ok(state.notices.some((n) => n.includes("扫描完成")), "scan 没有提示");
});

test("L5 assign：写入 overrides 后可用，且测试会还原 store", async () => {
  const before = fs.readFileSync(STORE);
  try {
    const { state, ctx } = makeHarness();
    await state.run("assign skill:humanizer process", ctx());
    const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.equal(raw.overrides?.["skill:humanizer"], "process", "overrides 未写入");
    assert.ok(state.notices.some((n) => n.includes("已把")), "assign 无提示");
  } finally {
    fs.writeFileSync(STORE, before);
  }
  assert.equal(hashStore(), crypto.createHash("sha256").update(before).digest("hex"), "store 未还原");
});

test("L5 取消：不写记录、不改工具集", async () => {
  const { state, ctx } = makeHarness();
  const before = [...state.active];
  await state.run("debug+process", ctx([], [false]));
  assert.equal(state.entries.length, 0);
  assert.deepEqual(state.active, before);
});

test("L5 未知单场景 id：不崩，按动态需求处理", async () => {
  const { state, ctx } = makeHarness();
  await state.run("zzz-not-a-scenario", ctx([], [false]));
  assert.equal(state.entries.length, 0, "取消后不应落记录");
  assert.ok(state.notices.length > 0, "应有提示");
});

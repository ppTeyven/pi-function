// 启用验证 · 第 4 组：命令入口 → 装配链路真的打通（handler 端到端）
// 注意：handler 每次都会 scan() 真实目录并重建 profile，所以这一组只断言
// 与「具体哪个插件」无关的确定性行为；插件级归属由 enable-02/03 用显式 profile 保证。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, builtinInfo, noticeText } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function env({ extraTools = [] } = {}) {
  const tools = [
    ...coreTools(),
    ...pkgTools("pi-lens", ["lens_diagnostics"]),
    ...pkgTools("@juicesharp/rpiv-todo", ["todo"]),
    ...pkgTools("@plannotator/pi-extension", ["plannotator_submit_plan"]),
    tool("web_search", builtinInfo("web_search")),
    ...extraTools,
  ];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const cmd = state.commands.get("function");
  assert.ok(cmd?.handler, "/function 命令必须注册");
  return { pi, state, cmd, run: (args, opts) => cmd.handler(args, makeCtx(state, opts)) };
}

const coreAllActive = (state) => m.CORE_TOOLS.every((c) => state.active.includes(c));

test("handler：/function scenario <id> 确认后真的调用 setActiveTools", async () => {
  const { state, run } = env();
  const before = state.setCalls.length;
  await run("scenario plugin", { confirms: [true] });
  assert.ok(state.setCalls.length > before, "确认装配后必须写工具集");
});

test("handler：装配后 7 个核心工具全部可用", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  assert.ok(coreAllActive(state), `核心工具缺失：${m.CORE_TOOLS.filter((c) => !state.active.includes(c))}`);
});

test("handler：appendEntry 记录的工具集与真实 active 完全一致", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  const entry = state.entries.at(-1);
  assert.equal(entry.type, "function-scenario");
  assert.deepEqual(entry.d.tools, state.active, "会话记录与实际工具集不一致会导致 /reload 后还原错");
});

test("handler：拒绝确认时一个工具都不改动、也不写记录", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("scenario plugin", { confirms: [false] });
  assert.deepEqual(state.active, before, "取消后工具集必须原样");
  assert.equal(state.setCalls.length, 0, "取消时不应调用 setActiveTools");
  assert.equal(state.entries.length, 0, "取消时不应写会话记录");
});

test("handler：/function off 重置为全局常开（只剩内置工具）", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  await run("off");
  const all = state.tools;
  const expected = all.filter((t) => String(t.sourceInfo?.path || "").startsWith("builtin:")).map((t) => t.name);
  assert.deepEqual([...state.active].sort(), [...expected].sort(), "应只剩内置工具");
});

test("handler：/function off 写 null 墓碑（防止重启后复活旧场景）", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  await run("off");
  const tail = state.entries.at(-1);
  assert.equal(tail.d.id, null);
});

test("handler：未知场景 id 时提示且不改工具集", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("scenario nope");
  assert.match(noticeText(state), /未知场景 id/);
  assert.deepEqual(state.active, before);
  assert.equal(state.setCalls.length, 0);
});

test("handler：组合装配记录 combo id 与首个工作流", async () => {
  const { state, run } = env();
  await run("debug+process", { confirms: [true] });
  const entry = state.entries.at(-1);
  assert.equal(entry.d.id, "debug+process");
  assert.equal(entry.d.workflow, "debug");
});

test("handler：未知组合 id 直接拒绝（不改状态）", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("debug+notreal");
  assert.match(noticeText(state), /未知 id/);
  assert.deepEqual(state.active, before);
  assert.equal(state.entries.length, 0);
});

test("handler：/function status 报出当前组合与已启用的插件工具", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  await run("status");
  const text = noticeText(state);
  assert.match(text, /当前组合/);
  assert.match(text, /当前启用的插件工具/);
});

test("handler：装配通知里给出「启用 N 个 / 停用 M 个」的可核对数字", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  assert.match(noticeText(state), /当前 \d+ 个可用（新增 \d+，停用 \d+）/);
});

test("handler：连续两次装配同一场景，工具集不膨胀", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  const first = [...state.active].sort();
  await run("scenario plugin", { confirms: [true] });
  assert.deepEqual([...state.active].sort(), first);
});

test("handler：需求文本交给模型决策，本地不装配", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("写一个爬虫脚本", { hasUI: false });
  assert.deepEqual(state.active, before, "本地不得替用户装配");
  assert.equal(state.userMessages.length, 1, "应把需求发给模型");
  assert.match(state.userMessages[0].text, /assemble_scenario/, "要求模型用装配工具");
});

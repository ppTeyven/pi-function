// /function 的固定场景提交、失败输入以及无交互项目入口。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, builtinInfo, noticeText } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("@juicesharp/rpiv-todo", ["todo"]),
    ...pkgTools("@plannotator/pi-extension", ["plannotator_submit_plan"]), tool("web_search", builtinInfo("web_search"))];
  const { pi, state } = makePi({ tools });
  m.default(pi);
  const run = (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts));
  return { state, run };
}

test("固定场景：确认后工具生效，会话记录和状态通知反映实际装配", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("scenario plugin", { confirms: [true] });
  const after = state.active;
  for (const name of coreTools().map(t => t.name)) assert.ok(after.includes(name), name);
  const entry = state.entries.at(-1);
  assert.equal(entry.type, "function-scenario");
  assert.equal(entry.d.id, "plugin");
  assert.deepEqual(entry.d.tools, after);
  const enabled = after.filter(n => !before.includes(n)).length;
  const disabled = before.filter(n => !after.includes(n)).length;
  assert.ok(noticeText(state).includes(`当前 ${after.length} 个可用（新增 ${enabled}，停用 ${disabled}）`));
  await run("status");
  assert.match(noticeText(state), /当前组合：.*插件/);
  assert.match(noticeText(state), /当前启用的插件工具：/);
});

test("错误输入：未知固定场景和未知组合均拒绝且不写会话", async () => {
  const { state, run } = env();
  const before = [...state.active];
  for (const [command, expected] of [["scenario nope", /未知场景 id：nope/], ["debug+notreal", /未知 id：notreal/]]) {
    await run(command);
    assert.match(state.notices.at(-1).text, expected);
  }
  assert.deepEqual(state.active, before);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.entries.length, 0);
});

test("显式组合：混合场景和工作流时保留组合与执行方式", async () => {
  const { state, run } = env();
  await run("debug+process", { confirms: [true] });
  const { d } = state.entries.at(-1);
  assert.equal(d.id, "debug+process");
  assert.equal(d.workflow, "debug");
});

test("无确认界面时两个项目入口都只报告，不发送或装配", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("resume", { hasUI: false });
  await run("写一个爬虫脚本", { hasUI: false });
  const reports = state.messages.filter((x) => x.customType === "function-project");
  assert.equal(reports.length, 2);
  assert.doesNotMatch(reports[0].content, /### 本轮需求/);
  assert.match(reports[1].content, /### 本轮需求\n- 本地匹配候选：/);
  assert.doesNotMatch(reports[1].content, /写一个爬虫脚本/, "未接受模型分析前，原文不进会话报告");
  assert.deepEqual(state.active, before);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.entries.length, 0);
  assert.equal(state.userMessages.length, 0);
});

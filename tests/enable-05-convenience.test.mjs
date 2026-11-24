// 便利性验证 · 第 5 组：
//   单 id 直达 / 装配后下一步 / status 解释 / 菜单按最近排序 / 点按多选 / 提案精简与工具说明
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, builtinInfo, noticeText, emptyStore,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function env({ activeCore = true } = {}) {
  const tools = [
    ...coreTools(),
    ...pkgTools("pi-lens", ["lens_diagnostics"]),
    ...pkgTools("@plannotator/pi-extension", ["plan_submit"]),
    tool("unrelated_tool", { path: "/x/node_modules/@example/unrelated/dist/index.js", source: "npm:@example/unrelated" }),
  ];
  const active = activeCore ? tools.map((t) => t.name) : [...coreTools().map((t) => t.name)];
  const { pi, state } = makePi({ tools, active });
  m.default(pi);
  const cmd = state.commands.get("function");
  return { state, run: (args, opts) => cmd.handler(args, makeCtx(state, opts)) };
}

const storeOnDisk = () => JSON.parse(fs.readFileSync(process.env.PI_FUNCTION_STORE, "utf8"));

/* ------------------------- 单 id 直达 ------------------------- */
test("直达：/function plugin 走固定场景装配（不是动态分析）", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  const entry = state.entries.at(-1);
  assert.equal(entry.d.id, "plugin", "应识别为固定场景 id");
  assert.ok(!state.messages.some((x) => x.customType === "function-need"), "不应走动态需求分析");
});

test("直达：/function debug 直接走工作流（不再掉进动态分析）", async () => {
  const { state, run } = env();
  await run("debug", { confirms: [true] });
  const entry = state.entries.at(-1);
  assert.equal(entry.d.id, "workflow");
  assert.equal(entry.d.workflow, "debug");
});

test("直达：/function off 仍走还原，不被场景/工作流 id 抢走", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  await run("off");
  assert.equal(state.entries.at(-1).d.id, null, "off 必须写 null 墓碑");
});

test("直达：/function resume 仍是项目续接（简历场景用 scenario resume）", async () => {
  const { state, run } = env();
  await run("resume", { hasUI: false });
  assert.ok(state.messages.some((x) => x.customType === "function-project"), "resume 应走项目续接");
  assert.equal(state.entries.length, 0, "项目续接在无 UI 时不装配");
});

test("直达：不存在的 id 当作需求文本交给模型", async () => {
  const { state, run } = env();
  await run("zzz-not-a-real-id", { selects: ["✓ 让模型决定工作流（推荐）"] });
  assert.equal(state.userMessages.length, 1);
  assert.match(state.userMessages[0].text, /zzz-not-a-real-id/);
});

/* ------------------------- 装配后下一步 ------------------------- */
test("通知：装配后给出「还原 /function off · 详情 /function status」", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  const text = noticeText(state);
  assert.match(text, /还原 \/function off/);
  assert.match(text, /详情 \/function status/);
});

test("通知：报的是「启用 N 个，停用 M 个」的紧凑格式", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  assert.match(noticeText(state), /当前 \d+ 个可用（新增 \d+，停用 \d+）/);
});

test("通知：缺装插件的告警带可执行修复建议", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  const text = noticeText(state);
  if (/需要留意/.test(text)) assert.match(text, /修复：/);
});

/* ------------------------- status 解释未启用工具 ------------------------- */
test("status：列出「未启用的可选工具」及所属包", async () => {
  const { state, run } = env({ activeCore: false });
  await run("status");
  const text = noticeText(state);
  assert.match(text, /未启用的可选工具/);
  assert.match(text, /pi-lens/, "应报出未启用工具所属的包");
});

test("status：全部启用时明说「（无）」而不是省略这一行", async () => {
  const { state, run } = env();
  await run("status");
  assert.match(noticeText(state), /未启用的可选工具：（无）/);
});

/* ------------------------- 使用反馈 / 菜单排序 ------------------------- */
test("反馈：装配后 store.recent 记录场景与工作流", async () => {
  const { run } = env();
  await run("plugin", { confirms: [true] });
  const saved = storeOnDisk();
  assert.equal(saved.recent?.scenario, "plugin");
  assert.ok(saved.recent?.at, "应记录时间");
});

test("反馈：recordUsage 累积 workflow 使用次数（只用于菜单排序）", () => {
  const store = emptyStore();
  const wf = m.WORKFLOWS.find((w) => w.id === "debug");
  const sc = { id: "plugin", plugins: [], skillIds: [] };
  m.recordUsage(store, sc, wf);
  m.recordUsage(store, sc, wf);
  assert.equal(store.wfUsage.debug, 2);
});

test("排序：装配过的场景在 assemble 菜单里排第一", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  state.selectCalls.length = 0;
  await run("assemble", { selects: ["direct", "✓ 完成选择", "plugin", "✓ 完成选择"], confirms: [true] });
  const picker = state.selectCalls.find((c) => /第 2 步：选任务场景/.test(c.title));
  assert.ok(picker, "应弹出场景点选列表");
  assert.match(picker.options[1], /plugin/, `第一项应是刚用过的场景：${picker.options[1]}`);
});

/* ------------------------- 点按多选 ------------------------- */
test("点按：多选是 select 循环，不再弹文本输入框", async () => {
  const { state, run } = env();
  await run("assemble", { selects: ["direct", "✓ 完成选择", "plugin", "✓ 完成选择"], confirms: [true] });
  const titles = state.selectCalls.map((c) => c.title).join(" | ");
  assert.match(titles, /第 1 步：选工作流/);
  assert.match(titles, /第 2 步：选任务场景/);
  assert.ok(!state.messages.some((x) => x.customType === "function-picker"), "不应再发文本列表消息");
});

test("点按：已选项标 ✓，再点一次可取消", async () => {
  const { state, run } = env();
  await run("workflow", { selects: ["direct", "direct", "debug", "✓ 完成选择"] });
  assert.equal(state.entries.at(-1).d.workflow, "debug", "取消后只应保留 debug");
  assert.match(state.selectCalls[1].options.join(" | "), /✓ direct/, "已选项应带 ✓ 标记");
});

test("点按：达到上限后不再弹列表", async () => {
  const { state, run } = env();
  const before = state.selectCalls.length;
  await run("workflow", { selects: ["debug", "parallel", "research"] });
  const picks = state.selectCalls.slice(before).filter((c) => /选工作流/.test(c.title));
  assert.equal(picks.length, 3, "选满 3 个后不应再弹");
  assert.equal(state.entries.at(-1).d.workflow, "debug+parallel+research");
});

/* ------------------------- 提案精简 + 工具说明 ------------------------- */
const proposalOf = (tools, { skills = [], unselected = [] } = {}) => {
  const sc = {
    id: "demo", title: "测试场景", when: "demo", group: "通用", keywords: [], brief: "",
    plugins: ["pi-lens"], skillIds: skills, dynamic: true,
    analysis: { audit: { unselected } },
  };
  const store = { known: Object.fromEntries(skills.map((x) => [`skill:${x.id}`, { description: x.desc }])) };
  const { pi } = makePi({ tools, active: tools.map((t) => t.name) });
  return m.buildProposal(pi, sc, store, null);
};

const MANY_TOOLS = [...coreTools(), ...pkgTools("pi-lens", Array.from({ length: 14 }, (_, i) => `t${i + 1}`))];
const FEW_TOOLS = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics", "symbol_search"])];

test("提案：整段控制在 48 行以内", () => {
  const lines = proposalOf(MANY_TOOLS).split("\n").filter((l) => l.trim());
  assert.ok(lines.length <= 48, `提案 ${lines.length} 行，太长了`);
});

test("提案：只说开了什么，不再铺分析过程", () => {
  const text = proposalOf(MANY_TOOLS);
  for (const banned of ["全量核对", "逐词核对", "需求分析", "分配方法"]) {
    assert.ok(!text.includes(banned), `不该出现「${banned}」`);
  }
});

test("提案：包含插件、核心工具、还原入口三块", () => {
  const text = proposalOf(MANY_TOOLS);
  assert.match(text, /\*\*插件\*\*/);
  assert.match(text, /\*\*核心工具\*\*/);
  assert.match(text, /还原 \/function off/);
});

test("提案：插件用途用中文能力标签（不含英文长句）", () => {
  const line = proposalOf(FEW_TOOLS).split("\n").find((l) => l.includes("pi-lens"));
  assert.ok(line, "应有 pi-lens 行");
  assert.match(line, /[\u4e00-\u9fff]/, `用途应是中文：${line}`);
});

test("提案：每个列出的工具都有一句用途说明", () => {
  const text = proposalOf(FEW_TOOLS);
  const toolLines = text.split("\n").filter((l) => /^\s+- `/.test(l));
  assert.ok(toolLines.length > 0, "应有工具行");
  for (const line of toolLines) assert.match(line, /` — .+/, `工具缺说明：${line}`);
});

test("提案：词典命中的工具用中文说明", () => {
  const text = proposalOf(FEW_TOOLS);
  assert.match(text, /`lens_diagnostics` — 查代码问题/);
  assert.match(text, /`symbol_search` — 按名字找符号/);
});

test("提案：没有词典的工具用描述首句兜底", () => {
  assert.match(proposalOf(MANY_TOOLS), /`t1` — tool t1/);
});

test("提案：工具超过 12 个时折叠并给出查看入口", () => {
  assert.match(proposalOf(MANY_TOOLS), /…另有 2 个工具（\/function status 查看）/);
});

test("提案：技能最多列 5 个，其余折叠成一行", () => {
  const skills = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, desc: `技能 ${i}` }));
  assert.match(proposalOf(FEW_TOOLS, { skills }), /…另有 3 个/);
});

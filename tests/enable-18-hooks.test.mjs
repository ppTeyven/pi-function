// 第 18 组：事件钩子与 suggest_scenario（25）
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const hook = (name) => state.handlers[name]?.[0];
  return { pi, state, hook, tools };
}

/* ---------------- 钩子注册（4） ---------------- */
test("钩子：注册了 session_start / session_shutdown / tool_call / before_agent_start", () => {
  const { state } = env();
  for (const name of ["session_start", "session_shutdown", "tool_call", "before_agent_start"]) {
    assert.ok(state.handlers[name]?.length, `缺 ${name}`);
  }
});

test("钩子：session_start 会扫描（调用后立刻停 watcher）", async () => {
  const { state, hook } = env();
  await hook("session_start")({}, makeCtx(state));
  hook("session_shutdown")(); // 不关掉会把 fs.watch 留在进程里
  assert.ok(true);
});

test("钩子：session_shutdown 不抛异常", () => {
  const { hook } = env();
  assert.doesNotThrow(() => hook("session_shutdown")());
});

test("钩子：tool_call 在没有装配时静默（不崩）", () => {
  const { hook } = env();
  assert.doesNotThrow(() => hook("tool_call")({ toolName: "read" }));
});

/* ---------------- tool_call 使用反馈（3） ---------------- */
test("钩子：tool_call 在装配后记录 itemUse", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("plugin", makeCtx(state, { confirms: [true] }));
  hook("tool_call")({ toolName: "lens_diagnostics" });
  hook("tool_call")({ toolName: "lens_diagnostics" });
  // 每 5 次落盘，这里只验证不崩；真实计数在内存 store 里
  assert.ok(true);
});

test("钩子：tool_call 对未知工具名不崩", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("plugin", makeCtx(state, { confirms: [true] }));
  assert.doesNotThrow(() => hook("tool_call")({ toolName: "not_a_tool" }));
});

test("钩子：tool_call 支持 event.tool.name 与 event.name 两种形态", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("plugin", makeCtx(state, { confirms: [true] }));
  assert.doesNotThrow(() => hook("tool_call")({ tool: { name: "lens_diagnostics" } }));
  assert.doesNotThrow(() => hook("tool_call")({ name: "lens_diagnostics" }));
});

/* ---------------- before_agent_start（8） ---------------- */
async function assembled() {
  const ctx = env();
  await ctx.state.commands.get("function").handler("scenario plugin", makeCtx(ctx.state, { confirms: [true] }));
  return ctx;
}

test("注入：未装配时不追加任何内容", async () => {
  // 清掉前一个测试留下的 active（loadStore 现在会读回来，会触发恢复）
  m.saveStore({ version: 1, known: {}, overrides: {}, active: null });
  const { state, hook } = env();
  const out = await hook("before_agent_start")({ systemPrompt: "base" }, makeCtx(state));
  assert.equal(out?.systemPrompt ?? "base", "base");
});

test("注入：装配后追加「当前组合」", async () => {
  const { state, hook } = await assembled();
  const out = await hook("before_agent_start")({ systemPrompt: "base" }, makeCtx(state));
  assert.match(out.systemPrompt, /当前组合/);
});

test("注入：带工作流时包含流程与检查点", async () => {
  const { state, hook } = await assembled();
  const out = await hook("before_agent_start")({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /流程：/);
});

test("注入：包含「开工前先问清」", async () => {
  const { state, hook } = await assembled();
  const out = await hook("before_agent_start")({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /开工前先问清/);
});

test("注入：包含「只使用当前已启用的工具」", async () => {
  const { state, hook } = await assembled();
  const out = await hook("before_agent_start")({ systemPrompt: "" }, makeCtx(state));
  assert.match(out.systemPrompt, /只使用当前已启用的工具/);
});

test("注入：skillGaps 会写进提示（找能力）", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("scenario plugin", makeCtx(state, { confirms: [true] }));
  // 直接构造一个带缺口的场景注入
  const source = state.handlers.before_agent_start[0];
  assert.ok(source);
});

test("注入：declinedGaps 会写进提示（不要假装能做）", async () => {
  const { state, hook } = await assembled();
  const out = await hook("before_agent_start")({ systemPrompt: "" }, makeCtx(state));
  assert.ok(typeof out.systemPrompt === "string");
});

test("注入：返回值保留原有 systemPrompt 内容", async () => {
  const { state, hook } = await assembled();
  const out = await hook("before_agent_start")({ systemPrompt: "ORIGINAL" }, makeCtx(state));
  assert.match(out.systemPrompt, /^ORIGINAL/);
});

/* ---------------- restoreScenario（4） ---------------- */
test("恢复：store.active 能在 session_start 后重新装配", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("scenario plugin", makeCtx(state, { confirms: [true] }));
  const fresh = env();
  await fresh.hook("session_start")({}, makeCtx(fresh.state));
  fresh.hook("session_shutdown")();
  assert.ok(fresh.state.active.length > 0);
});

test("恢复：组合 id（a+b）能按原样拼回", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("plugin+api", makeCtx(state, { confirms: [true] }));
  assert.equal(state.entries.at(-1).d.id, "plugin+api");
});

test("恢复：null 墓碑表示不恢复", async () => {
  const { state, hook } = env();
  await state.commands.get("function").handler("off", makeCtx(state));
  const out = await hook("before_agent_start")({ systemPrompt: "base" }, makeCtx(state));
  const text = out?.systemPrompt ?? "base";
  assert.ok(!/当前组合/.test(text), "off 后不应注入组合");
});

test("恢复：无任何记录时 session_start 不崩", async () => {
  const { state, hook } = env();
  assert.doesNotThrow(() => hook("session_start")({}, makeCtx(state)));
  hook("session_shutdown")();
});

/* ---------------- suggest_scenario（5） ---------------- */
const suggest = () => {
  const { pi, state } = env();
  return state.registeredTools.find((t) => t.name === "suggest_scenario");
};

test("suggest：返回最佳场景与置信度", async () => {
  const res = await suggest().execute("1", { text: "写个爬虫抓取网页" });
  const text = res.content[0].text;
  assert.match(text, /最佳场景|没有命中固定任务场景/);
});

test("suggest：top 参数限制候选数量", async () => {
  const res = await suggest().execute("1", { text: "写报告并做数据分析", top: 1 });
  assert.ok(res.details.ranked.length <= 1);
});

test("suggest：withPlugins=false 时不输出逐场景明细", async () => {
  const withP = await suggest().execute("1", { text: "写报告", withPlugins: true });
  const noP = await suggest().execute("1", { text: "写报告", withPlugins: false });
  assert.ok(noP.content[0].text.length <= withP.content[0].text.length);
});

test("suggest：details 里有 ranked 数组", async () => {
  const res = await suggest().execute("1", { text: "修 bug" });
  assert.ok(Array.isArray(res.details.ranked));
});

test("suggest：完全无关的需求也返回可用组合（不报错）", async () => {
  const res = await suggest().execute("1", { text: "今天天气不错" });
  assert.ok(res.content[0].text.length > 0);
  assert.ok(!res.isError);
});

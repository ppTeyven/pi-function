// 宿主事件使用反馈，以及候选建议的面向用户选项。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools });
  m.default(pi);
  const hook = (name) => state.handlers[name][0];
  const run = (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts));
  return { state, hook, run };
}

test("工具反馈：关闭前落盘，三种宿主事件都记到所属插件，未装配时不计数", async () => {
  const { hook, run } = env();
  const call = hook("tool_call");
  call({ toolName: "lens_diagnostics" });
  await run("plugin", { confirms: [true] });
  call({ toolName: "lens_diagnostics" });
  call({ tool: { name: "lens_diagnostics" } });
  call({ name: "lens_diagnostics" });
  call({ toolName: "not_a_tool" });
  hook("session_shutdown")();
  const after = m.loadStore().itemUse;
  assert.equal(after.plugin?.["pi-lens"], 3);
  hook("session_shutdown")();
  assert.deepEqual(m.loadStore().itemUse, after);
});

test("候选建议：可以隐藏逐场景插件明细，不改变排名和活动工具", async () => {
  const { state } = env();
  const suggest = state.registeredTools.find(t => t.name === "suggest_scenario");
  const before = [...state.active];
  const detailed = await suggest.execute("detailed", { text: "写报告", withPlugins: true });
  const compact = await suggest.execute("compact", { text: "写报告", withPlugins: false });
  assert.equal(detailed.details.matched, true);
  assert.match(detailed.content[0].text, /^### report$/m);
  assert.doesNotMatch(compact.content[0].text, /^### report$/m);
  assert.deepEqual(compact.details.ranked, detailed.details.ranked);
  assert.deepEqual(state.active, before);
});

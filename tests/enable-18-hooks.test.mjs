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

test("模型查询：不同需求得到完全相同的只读目录，不返回本地排名", async () => {
  const { state } = env();
  const read = state.registeredTools.find(t => t.name === "suggest_scenario");
  const before = [...state.active];
  const report = await read.execute("a", { text: "写报告" });
  const software = await read.execute("b", { text: "查当前插件的错误" });
  assert.deepEqual(report, software);
  assert.ok(!("ranked" in report.details));
  assert.ok(report.details.scenarios.some(s => s.id === "report"));
  const course = report.details.scenarios.find(s => s.id === "course");
  const docs = report.details.scenarios.find(s => s.id === "docs");
  const commerce = report.details.scenarios.find(s => s.id === "commerce");
  const chatbot = report.details.scenarios.find(s => s.id === "chatbot");
  assert.deepEqual(course.manualPreset.required, ["slides"]);
  assert.deepEqual(m.SCENARIO_CONTRACTS.course.required, ["slides"], "手动预设不变");
  assert.ok(!Object.hasOwn(course, "contract"), "不向模型呈现未区分范围的硬必需项");
  assert.match(course.boundary, /不做幻灯片也可以有课程/);
  assert.deepEqual(docs.forbidden, m.SCENARIO_CONTRACTS.docs.forbidden);
  assert.match(report.details.roleBoundaries.docs, /可独立查阅或重复使用/);
  assert.match(report.details.roleBoundaries.writing, /书面分析意见或审阅结论.*不等于润色或改写原材料/);
  assert.deepEqual(commerce.manualPreset.required, m.SCENARIO_CONTRACTS.commerce.required);
  assert.match(commerce.boundary, /只改商品内容不动界面.*不自动要求页面设计/);
  assert.match(chatbot.boundary, /实际对话行为.*仅交人工参考材料/);
  assert.match(report.details.roleBoundaries["code-intel"], /新建项目和已有项目都可能需要/);
  assert.ok(report.details.inventory.tools.some(t => t.name === "lens_diagnostics" && t.active));
  assert.deepEqual(state.active, before);
  assert.equal(state.setCalls.length, 0);
});

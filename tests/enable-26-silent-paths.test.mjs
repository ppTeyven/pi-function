// 第 26 组：三处“静默降级”路径（25）
// A. suggest_scenario 的置信度判定
// B. restoreScenario 的各分支与降级
// C. scan 的完整度守卫
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const suggestTool = () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { tool: state.registeredTools.find((t) => t.name === "suggest_scenario"), state };
};

/* ==================== A. 置信度判定（8） ==================== */
test("置信度：confident 与 ranked 的关系自洽（不变量）", async () => {
  const { tool } = suggestTool();
  for (const text of ["写个爬虫抓取网页", "做个报告", "修 bug", "画个海报", "今天天气不错"]) {
    const res = await tool.execute("1", { text });
    const d = res.details;
    if (!d.ranked?.length) continue;
    const best = d.ranked[0];
    const next = d.ranked[1];
    const expected = best.score >= 1.2 && (!next || best.score >= next.score * 1.5);
    assert.equal(d.confident, expected, `「${text}」confident 不自洽`);
  }
});

test("置信度：details.confident 是布尔值", async () => {
  const { tool } = suggestTool();
  const res = await tool.execute("1", { text: "写个报告" });
  assert.equal(typeof res.details.confident, "boolean");
});

test("置信度：文本里给出置信度结论", async () => {
  const { tool } = suggestTool();
  const res = await tool.execute("1", { text: "写个报告" });
  assert.match(res.content[0].text, /置信度：(足够|不足)/);
});

test("置信度：不足时建议把候选给用户选", async () => {
  const { tool } = suggestTool();
  const res = await tool.execute("1", { text: "帮我看看这个" });
  const text = res.content[0].text;
  if (/置信度：不足/.test(text)) assert.match(text, /建议把候选摆给用户选/);
});

test("置信度：没有命中时 matched=false 且 ranked 为空", async () => {
  const { tool } = suggestTool();
  const res = await tool.execute("1", { text: "   " });
  assert.equal(res.details.matched, false);
  assert.deepEqual(res.details.ranked, []);
});

test("置信度：top 参数限制返回条数", async () => {
  const { tool } = suggestTool();
  const res = await tool.execute("1", { text: "写报告并做数据分析", top: 2 });
  assert.ok(res.details.ranked.length <= 2);
});

test("置信度：top 越界会被夹到 1-5", async () => {
  const { tool } = suggestTool();
  const hi = await tool.execute("1", { text: "写报告", top: 99 });
  assert.ok(hi.details.ranked.length <= 5);
  const lo = await tool.execute("1", { text: "写报告", top: -3 });
  assert.ok(lo.details.ranked.length >= 1);
});

test("置信度：details 里带 best（id/score/hits）", async () => {
  const { tool } = suggestTool();
  const res = await tool.execute("1", { text: "写个报告" });
  if (res.details.matched) {
    assert.ok(res.details.best?.id);
    assert.equal(typeof res.details.best.score, "number");
    assert.ok(Array.isArray(res.details.best.hits));
  }
});

/* ==================== B. restoreScenario（10） ==================== */
function envWithStore(active) {
  // 预写 store，session_start 时会读它
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known: {}, overrides: {}, active }));
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { pi, state, tools };
}

const runSessionStart = (state) => {
  state.handlers.session_start[0]({}, makeCtx(state));
  state.handlers.session_shutdown[0]();
};

test("恢复：store.active.id=plugin 能恢复固定场景", () => {
  const { state } = envWithStore({ id: "plugin", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: ["read"] });
  runSessionStart(state);
  assert.ok(state.setCalls.length > 0, "应重新装配");
});

test("恢复：workflow 型 id 恢复成工作流场景", () => {
  const { state } = envWithStore({ id: "workflow", workflow: "debug", at: "2026-01-01T00:00:00.000Z", tools: [] });
  runSessionStart(state);
  assert.ok(state.setCalls.length > 0);
});

test("恢复：组合 id（a+b）能拼回", () => {
  const { state } = envWithStore({ id: "plugin+api", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [] });
  runSessionStart(state);
  assert.ok(state.setCalls.length > 0);
});

test("恢复：组合 id 全是工作流时按 workflowOnly 恢复", () => {
  const { state } = envWithStore({ id: "debug+research", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [] });
  runSessionStart(state);
  assert.ok(state.setCalls.length > 0);
});

test("恢复：custom 型只凭 need 也能恢复（不崩）", () => {
  const { state } = envWithStore({ id: "custom", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [], custom: { need: "写个爬虫" } });
  assert.doesNotThrow(() => runSessionStart(state));
});

test("恢复：custom 里带的 packages/skills 会被采用", () => {
  const { state } = envWithStore({
    id: "custom", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [],
    custom: { need: "写个爬虫", packages: ["pi-lens"], skills: [] },
  });
  runSessionStart(state);
  assert.ok(state.active.includes("lens_diagnostics"), `应带上 custom 的包：${state.active.join(",")}`);
});

test("恢复：project 型在目录不可读时降级为动态任务（不崩）", () => {
  const { state } = envWithStore({
    id: "project", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [],
    custom: { need: "项目全局", root: "Z:/definitely-missing-dir-xyz" },
  });
  assert.doesNotThrow(() => runSessionStart(state));
});

test("恢复：project 型缺 custom.need 时用「项目全局」兜底", () => {
  const { state } = envWithStore({ id: "project", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [], custom: { root: "Z:/missing" } });
  assert.doesNotThrow(() => runSessionStart(state));
});

test("恢复：未知 id 直接放弃（不装配、不崩）", () => {
  const { state } = envWithStore({ id: "not-a-real-scene", workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [] });
  runSessionStart(state);
  assert.equal(state.setCalls.length, 0, "未知 id 不应装配");
});

test("恢复：null 墓碑（off 之后）不恢复", () => {
  const { state } = envWithStore({ id: null, workflow: null, at: "2026-01-01T00:00:00.000Z", tools: [] });
  runSessionStart(state);
  assert.equal(state.setCalls.length, 0);
});

/* ==================== C. scan 完整度守卫（7） ==================== */
test("守卫：源码里有完整度阈值（max(5, known*0.3)）", () => {
  const src = fs.readFileSync("C:/Users/zzkkg/.pi/agent/extensions/function-menu.js", "utf8");
  assert.match(src, /items\.size < Math\.max\(5, knownCount \* 0\.3\)/);
});

test("守卫：触发时直接 return，不 reconcile", () => {
  const src = fs.readFileSync("C:/Users/zzkkg/.pi/agent/extensions/function-menu.js", "utf8");
  const i = src.indexOf("if (knownCount && items.size < Math.max(5, knownCount * 0.3))");
  const block = src.slice(i, i + 120);
  assert.match(block, /return \[\]/, "守卫分支应立即返回");
});

test("守卫：knownCount 为 0 时不触发（首次扫描）", () => {
  const { state } = envWithStore(null);
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known: {}, overrides: {} }));
  assert.doesNotThrow(() => state.commands.get("function").handler("scan", makeCtx(state)));
});

test("守卫：扫描后 local 扩展被登记（真实目录存在 function-menu.js）", () => {
  const store = { known: {}, overrides: {} };
  const items = m.discoverItems({ getAllTools: () => [], getCommands: () => [] });
  const hasLocal = [...items.keys()].some((k) => k.startsWith("local:"));
  assert.equal(hasLocal, true, `应发现本地扩展：${[...items.keys()].slice(0, 5)}`);
});

test("守卫：discoverItems 能从 npm 依赖里发现包", () => {
  const items = m.discoverItems({ getAllTools: () => [], getCommands: () => [] });
  assert.ok([...items.keys()].some((k) => k.startsWith("npm:")), "应发现 npm 包");
});

test("守卫：discoverItems 把工具归属到对应包", () => {
  const tools = [{ name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/a.js", source: "npm:pi-lens" } }];
  const items = m.discoverItems({ getAllTools: () => tools, getCommands: () => [] });
  const hit = [...items.values()].find((it) => it.pkg === "pi-lens");
  assert.ok(hit?.tools.includes("lens_diagnostics"), "工具应归属到 pi-lens");
});

test("守卫：discoverItems 把技能归到包或独立技能项", () => {
  const commands = [{ name: "skill:grill", source: "skill", sourceInfo: { path: "/x/node_modules/pi-lens/skills/g/SKILL.md", source: "npm:pi-lens" } }];
  const items = m.discoverItems({ getAllTools: () => [], getCommands: () => commands });
  const hit = [...items.values()].find((it) => it.pkg === "pi-lens");
  assert.ok(hit?.skills.includes("grill"), "技能应归属到包");
});

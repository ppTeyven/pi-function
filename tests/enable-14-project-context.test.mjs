// 第 14 组：需求分析必须看到项目的来路与走向
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXT, isolate, makePi, makeCtx, coreTools, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

/** 造一个带 AGENTS.md + HANDOFF.md 的项目 */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fn-proj-"));
  fs.writeFileSync(path.join(dir, "AGENTS.md"), [
    "# 规则",
    "- [ ] 把拼音转换器的多音字处理做完",
    "- [ ] 补 100 个测试",
    "## 阻塞",
    "- 云端额度用完",
    "## 下一步",
    "- 先修多音字再跑回归",
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "HANDOFF.md"), "阶段：功能开发中\n未完成：多音字处理\n");
  return dir;
}
const EMPTY = fs.mkdtempSync(path.join(os.tmpdir(), "fn-empty-"));

const projectOf = (dir) => m.analyzeProjectContext(m.scanProjectContext({ cwd: dir }), { known: {} });

/* ---------------- projectBrief（5） ---------------- */
test("项目摘要：空目录也能给出阶段（不崩）", () => {
  const text = m.projectBrief(projectOf(EMPTY));
  assert.ok(typeof text === "string");
  assert.match(text, /阶段：/);
});

test("项目摘要：列出未完成事项（来路）", () => {
  const text = m.projectBrief(projectOf(makeProject()));
  assert.match(text, /未完成：.*多音字/);
});

test("项目摘要：列出阻塞与下一步（走向）", () => {
  const text = m.projectBrief(projectOf(makeProject()));
  assert.match(text, /阻塞\/风险：.*额度/);
  assert.match(text, /下一步：/);
});

test("项目摘要：列出关键文档名", () => {
  const text = m.projectBrief(projectOf(makeProject()));
  assert.match(text, /HANDOFF\.md/);
  assert.match(text, /AGENTS\.md/);
});

test("项目摘要：null 输入返回空串", () => {
  assert.equal(m.projectBrief(null), "");
});

/* ---------------- 缓存（2） ---------------- */
test("缓存：同一 cwd 内重复取用同一份结果", () => {
  const dir = makeProject();
  const a = m.projectBriefFor({ cwd: dir }, { known: {} });
  const b = m.projectBriefFor({ cwd: dir }, { known: {} });
  assert.equal(a, b, "应命中缓存（同一对象）");
});

test("缓存：换 cwd 会重新扫描", () => {
  const a = m.projectBriefFor({ cwd: makeProject() }, { known: {} });
  const b = m.projectBriefFor({ cwd: makeProject() }, { known: {} });
  assert.notEqual(a.cwd, b.cwd);
});

/* ---------------- /function <需求>（3） ---------------- */
function env(dir) {
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const run = (args, opts) => state.commands.get("function").handler(args, { ...makeCtx(state, opts), cwd: dir });
  return { state, pi, run };
}

test("交给模型：消息里带【项目来路与走向】", async () => {
  const { state, run } = env(makeProject());
  await run("把多音字处理接完");
  assert.match(state.userMessages[0].text, /【项目来路与走向】/);
});

test("交给模型：消息里带未完成事项与阻塞", async () => {
  const { state, run } = env(makeProject());
  await run("继续");
  const text = state.userMessages[0].text;
  assert.match(text, /未完成：/);
  assert.match(text, /阻塞\/风险：/);
});

test("交给模型：明确要求结合项目上下文判断", async () => {
  const { state, run } = env(makeProject());
  await run("继续");
  assert.match(state.userMessages[0].text, /结合上面的项目上下文判断/);
});

/* ---------------- 装配后注入（2） ---------------- */
test("模型装配：项目上下文会挂到场景上，由 before_agent_start 注入", async () => {
  const dir = makeProject();
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const asm = state.registeredTools.find((t) => t.name === "assemble_scenario");
  // 工具内部用 process.cwd()，这里切到项目目录
  const old = process.cwd();
  process.chdir(dir);
  try {
    await asm.execute("1", { scenario: "plugin" });
  } finally {
    process.chdir(old);
  }
  const hook = state.handlers.before_agent_start?.[0];
  assert.ok(hook, "应有 before_agent_start 钩子");
  const out = await hook({ systemPrompt: "base" });
  assert.match(out.systemPrompt, /项目续接|阶段/);
});

test("模型装配：注入内容包含项目阶段", async () => {
  const dir = makeProject();
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const old = process.cwd();
  process.chdir(dir);
  try {
    await state.registeredTools.find((t) => t.name === "assemble_scenario").execute("1", { scenario: "plugin" });
  } finally {
    process.chdir(old);
  }
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "" });
  assert.match(out.systemPrompt, /项目续接（不只看当前这句话）/);
});

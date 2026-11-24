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
    "- [x] 已跑过初版转换测试",
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
  const context = (opts) => ({
    ...makeCtx(state, opts), cwd: dir,
    sessionManager: { getSessionId: () => "project-14", getBranch: () => [{ type: "compaction", summary: "上次停在初版测试" }] },
  });
  const run = (args, opts = { selects: ["✓ 让模型决定工作流（推荐）"] }) => state.commands.get("function").handler(args, context(opts));
  const tool = (name) => state.registeredTools.find((t) => t.name === name);
  return { state, run, context, tool };
}

const progress = (report) => report.split(/### 本轮需求|### 全项目需求/)[0];
const needRequestId = (state) => /^装配请求 ID：([^\n]+)/m.exec(state.userMessages[0].text)?.[1];

test("两个入口报告同一份项目进度，模型同时收到本轮需求和具体项目证据", async () => {
  const dir = makeProject();
  const resume = env(dir);
  await resume.run("resume", { selects: [] });
  const { state, run, tool, context } = env(dir);
  const need = "把多音字处理接完";
  await run(need);
  const [a, b] = [resume.state, state].map(({ messages }) => messages.find((x) => x.customType === "function-project").content);
  assert.equal(progress(a), progress(b), "两个入口的项目证据和进度不能缩水或分叉");
  assert.match(b, /已完成.*初版转换测试/);
  assert.match(b, /当前会话：读取了最近 1 条/);
  assert.match(b, /### 本轮需求\n- 本地匹配候选：/);
  assert.equal(resume.state.selectCalls[0].title, state.selectCalls[0].title);
  const text = state.userMessages[0].text;
  assert.match(text, /^需求：把多音字处理接完$/m);
  assert.match(text, /结合上面的项目上下文判断/);
  assert.match(text, /未完成：.*多音字处理/);
  assert.match(text, /阻塞\/风险：.*云端额度用完/);
  assert.match(text, /下一步：先修多音字再跑回归/);
  const suggest = await tool("suggest_scenario").execute("1", { text: need }, undefined, undefined, context());
  assert.match(suggest.content[0].text, /阻塞\/风险：.*云端额度用完/);
});

test("模型提出方案后仍须确认；取消、遗漏或跨会话使用请求 ID 不得切换工具", async () => {
  const { state, run, context, tool } = env(makeProject());
  const need = "把多音字处理接完";
  await run(need);
  const requestId = needRequestId(state);
  assert.ok(requestId);
  const ctx = context();
  const assemble = (params, owner = ctx) => tool("assemble_scenario").execute("2", { scenario: "plugin", ...params }, undefined, undefined, owner);
  assert.equal((await assemble({})).isError, true);
  assert.equal((await assemble({ requestId }, { ...ctx, sessionManager: { getSessionId: () => "different" } })).isError, true);
  ctx.ui.confirm = async (_title, text) => {
    assert.match(text, /当前阶段：.*阻塞/);
    assert.equal(state.messages.at(-1).customType, "function-proposal");
    assert.equal(state.setCalls.length, 0);
    return false;
  };
  assert.equal((await assemble({ requestId })).details.cancelled, true);
  assert.equal((await assemble({ requestId })).isError, true);
  assert.equal(state.editorText, need);
  assert.equal(state.entries.length, 0);
  assert.equal(state.setCalls.length, 0);
  await run("resume", { selects: [] });
  assert.equal((await assemble({})).isError, true, "被其他命令打断的请求也不能脱离原确认流程");
  assert.equal(state.setCalls.length, 0);
});

test("确认后实际装配模型提出的场景，使用用户已选工作流", async () => {
  const { state, run, context, tool } = env(makeProject());
  await run("编写项目文档", { selects: ["research", "✓ 完成选择"] });
  assert.equal(state.setCalls.length, 0);
  assert.match(state.userMessages[0].text, /工作流（用户已指定，必须使用）：research/);
  const ctx = context({ confirms: [true, false, false, false, false, false, false] });
  const result = await tool("assemble_scenario").execute("3", { scenario: "docs", workflow: "debug", requestId: needRequestId(state) }, undefined, undefined, ctx);
  assert.equal(result.details?.workflow, "research");
  assert.equal(state.entries.at(-1)?.d.id, "docs");
  assert.deepEqual(state.entries.at(-1).d.tools, state.active);
  assert.deepEqual(state.messages.map((x) => x.customType), ["function-project", "function-proposal", "function-assembled"]);
});

test("缺少 PDF 能力：取消、跳过、同意查找分别作用于工具与提示", async () => {
  for (const choice of ["cancel", "skip", "search"]) {
    const { state, run, context, tool } = env(makeProject());
    const need = "把项目报告导出 PDF";
    await run(need);
    const ctx = context({ confirms: [true] });
    let asked = false;
    ctx.ui.select = async (title, options) => {
      if (!title.startsWith("本机没有「PDF")) return options[1];
      asked = true;
      return options[{ cancel: 2, skip: 1, search: 0 }[choice]];
    };
    const answer = await tool("assemble_scenario").execute("pdf", { scenario: "docs", requestId: needRequestId(state) }, undefined, undefined, ctx);
    assert.ok(asked, `必须问到真实的缺口：${choice}`);
    if (choice === "cancel") {
      assert.equal(answer.details.cancelled, true);
      assert.equal(state.setCalls.length, 0);
      assert.equal(state.entries.length, 0);
      assert.equal(state.editorText, need);
      assert.equal(state.userMessages.length, 1, "取消不得派发找技能");
      continue;
    }
    assert.equal(answer.details.id, "docs");
    assert.equal(state.userMessages.length, choice === "search" ? 2 : 1);
    if (choice === "search") assert.match(state.userMessages[1].text, /PDF.*等我确认/s);
    const hook = state.handlers.before_agent_start[0];
    const out = await hook({ systemPrompt: "base" }, ctx);
    assert.match(out.systemPrompt, choice === "search" ? /能力缺口：已征得同意去找\nPDF/ : /能力缺口：用户选择不找\nPDF/);
  }
});

/* ---------------- 装配后注入 ---------------- */
test("模型装配：项目上下文会挂到场景上，由 before_agent_start 注入", async () => {
  const dir = makeProject();
  const tools = [...coreTools()];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const asm = state.registeredTools.find((t) => t.name === "assemble_scenario");
  await asm.execute("1", { scenario: "plugin" }, undefined, undefined, { cwd: dir });
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
  await state.registeredTools.find((t) => t.name === "assemble_scenario")
    .execute("1", { scenario: "plugin" }, undefined, undefined, { cwd: dir });
  const out = await state.handlers.before_agent_start[0]({ systemPrompt: "" });
  assert.match(out.systemPrompt, /项目续接（不只看当前这句话）/);
});

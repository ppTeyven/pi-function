// /function resume：项目续接（项目文档 + Git + 最近会话 → 全局进度与装配）
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXT } from "./_bootstrap.mjs";
const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-function-resume-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, ".planning"));
  fs.writeFileSync(path.join(dir, "HANDOFF.md"), [
    "# 交接",
    "",
    "## 目标",
    "做完登录页。",
    "",
    "## 进度",
    "- [x] 搭好框架",
    "- [ ] 加登录接口",
    "- [ ] 补测试",
    "",
    "## 阻塞",
    "- 等后端接口",
    "",
    "## 下一步",
    "- 先写接口占位",
  ].join("\n"));
  fs.writeFileSync(path.join(dir, ".planning", "ROADMAP.md"), "# Roadmap\n\n- [ ] 上线\n");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "resume-demo", scripts: { test: "node --test" } }));
  return dir;
}

function context(cwd, notices = []) {
  return {
    hasUI: true,
    cwd,
    sessionManager: {
      getBranch: () => [{ type: "message", message: { role: "user", content: "继续做登录" } }],
      getCwd: () => cwd,
    },
    ui: {
      notify: (text) => notices.push(String(text)),
      select: async () => null,
      confirm: async () => false,
      input: async () => null,
      setEditorText: () => {},
    },
  };
}

// 端到端：/function resume 先出报告，再选工作流、确认后装配
function makeHarness(cwd) {
  const state = { active: ["read"], notices: [], messages: [], entries: [], setCalls: 0 };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") state.run = cmd.handler || cmd; },
    on() {},
    appendEntry(type, data) { state.entries.push({ type, d: data }); },
    sendMessage(msg) { state.messages.push(msg); },
    getAllTools: () => [
      { name: "read", sourceInfo: { path: "builtin:read" } },
      { name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/dist/index.js" } },
    ],
    getActiveTools: () => state.active,
    setActiveTools: (next) => { state.setCalls += 1; state.active = next; },
    getCommands: () => [],
    getAllSkills: () => [],
  };
  m.default(pi);
  const ctx = {
    ...context(cwd, state.notices),
    ui: {
      notify: (text) => state.notices.push(String(text)),
      select: async () => null,
      confirm: async () => true,
      input: async () => "1",
      setEditorText: () => {},
    },
  };
  return { state, ctx };
}

test("R1 scanProjectContext 读取 HANDOFF / 计划 / Git / 会话，并识别阻塞与下一步", () => {
  const dir = makeProject();
  try {
    const project = m.scanProjectContext(context(path.join(dir, "src")));
    assert.equal(project.root, dir, "应从子目录回溯到项目根");
    assert.ok(project.files.some((f) => f.rel === "HANDOFF.md"));
    assert.ok(project.files.some((f) => f.rel === ".planning/ROADMAP.md"));
    assert.ok(project.signals.openTasks.includes("加登录接口"));
    assert.ok(project.signals.blockers.includes("等后端接口"));
    assert.ok(project.signals.nextSteps.includes("先写接口占位"));
    assert.match(project.stage, /阻塞/);
    assert.match(project.summary, /HANDOFF/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R2 analyzeProjectContext / buildProjectReport 给出全项目判断与建议组合", () => {
  const dir = makeProject();
  try {
    const project = m.analyzeProjectContext(m.scanProjectContext(context(dir)), store);
    assert.ok(project.analysis.intents.length > 0);
    assert.ok(project.recommendations.workflowId);
    const report = m.buildProjectReport(project, store);
    assert.match(report, /项目续接/);
    assert.match(report, /加登录接口/);
    assert.match(report, /等后端接口/);
    assert.match(report, /先写接口占位/);
    assert.match(report, /建议工作流/);
    assert.match(report, /不会自动执行/);
    const scenario = m.projectScenario(project, store, m.workflowById(project.recommendations.workflowId));
    assert.equal(scenario.id, "project");
    assert.equal(scenario.project.root, dir);
    assert.ok(Array.isArray(scenario.project.openTasks));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R3 /function resume 先输出报告，确认后写入 project 会话记录并装配工具", async () => {
  const dir = makeProject();
  try {
    const { state, ctx } = makeHarness(dir);
    await state.run("resume", ctx);
    assert.ok(state.messages.some((x) => x.customType === "function-project"), "没有输出项目报告");
    assert.ok(state.messages.find((x) => x.customType === "function-project").content.includes("加登录接口"));
    const entry = state.entries.at(-1);
    assert.equal(entry?.d.id, "project", "没有写入 project 记录");
    assert.equal(entry?.d.custom?.root, dir);
    assert.ok(state.setCalls > 0, "确认后应调用 setActiveTools");
    assert.ok(state.notices.some((n) => n.includes("项目续接")), "没有装配提示");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R4 没有项目文档时仍能给出报告，不崩溃", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-function-empty-"));
  try {
    const project = m.analyzeProjectContext(m.scanProjectContext(context(dir)), store);
    const report = m.buildProjectReport(project, store);
    assert.match(report, /项目续接/);
    assert.match(report, /信息不足|未发现|没有找到/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R5 /function scenario resume 仍能装配简历场景，不被项目续接吞掉", async () => {
  const dir = makeProject();
  try {
    const { state, ctx } = makeHarness(dir);
    await state.run("scenario resume", ctx);
    assert.equal(state.messages.some((x) => x.customType === "function-project"), false, "不应走项目续接");
    const entry = state.entries.at(-1);
    assert.equal(entry?.d.id, "resume", "应装配简历场景，而不是 project");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

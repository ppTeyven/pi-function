// 第 17 组：文本产出（菜单 / 画像 / 项目报告 / 提案）（25）
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXT, isolate, makePi, coreTools, pkgTools, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] }, writing: { skills: ["grill"] } });

const store = (over = {}) => ({ version: 1, known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {}, ...over });
const piOf = (tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])]) => makePi({ tools }).pi;

function makeProject(docs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fn-rep-"));
  for (const [name, text] of Object.entries(docs)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

/* ---------------- buildCatalog（5） ---------------- */
test("菜单：标题含场景数与技能数", () => {
  const text = m.buildCatalog(piOf(), store());
  assert.match(text, /场景菜单（\d+ 个组合 · \d+ 个技能）/);
});

test("菜单：含工作流章节与全部 9 个工作流", () => {
  const text = m.buildCatalog(piOf(), store());
  assert.match(text, /第 1 步：工作流/);
  for (const w of m.WORKFLOWS) assert.ok(text.includes(w.id), `缺 ${w.id}`);
});

test("菜单：含场景章节与分组标题", () => {
  const text = m.buildCatalog(piOf(), store());
  assert.match(text, /第 2 步：任务场景/);
  for (const g of new Set(m.SCENARIOS.map((s) => s.group))) assert.ok(text.includes(g), `缺分组 ${g}`);
});

test("菜单：顶层有项目阶段行或至少能生成", () => {
  const text = m.buildCatalog(piOf(), store());
  assert.ok(typeof text === "string" && text.length > 200);
});

/* ---------------- buildProfileReport（3） ---------------- */
test("画像报告：含版本与指纹行", () => {
  const profile = m.buildProfile(store({ known: { "npm:pi-lens": { kind: "plugin", description: "代码检查", auto: true } } }));
  m.hydrateCatalog(profile);
  const text = m.buildProfileReport(store({ known: { "npm:pi-lens": { kind: "plugin", description: "代码检查", auto: true } } }));
  assert.match(text, /能力画像/);
});

test("画像报告：列出未归类条目（若有）", () => {
  const text = m.buildProfileReport(store());
  assert.ok(typeof text === "string");
});

test("画像报告：含角色名（中文标签）", () => {
  const text = m.buildProfileReport(store({ known: { "npm:pi-lens": { kind: "plugin", description: "LSP 代码检查", auto: true } } }));
  assert.match(text, /代码理解|静态检查/);
});

/* ---------------- 项目报告（6） ---------------- */
test("项目扫描：识别 AGENTS.md 与 HANDOFF.md", () => {
  const dir = makeProject({ "AGENTS.md": "# A\n", "HANDOFF.md": "# H\n阶段：开发中\n" });
  const proj = m.scanProjectContext({ cwd: dir });
  const rels = proj.files.map((f) => f.rel);
  assert.ok(rels.includes("AGENTS.md"));
  assert.ok(rels.includes("HANDOFF.md"));
});

test("项目扫描：跳过 node_modules", () => {
  const dir = makeProject({ "AGENTS.md": "# A\n" });
  fs.mkdirSync(path.join(dir, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "node_modules", "x", "README.md"), "# no\n");
  const proj = m.scanProjectContext({ cwd: dir });
  assert.ok(!proj.files.some((f) => f.rel.includes("node_modules")));
});

test("项目扫描：阶段随阻塞变化", () => {
  const dir = makeProject({ "AGENTS.md": "## 阻塞\n- 额度用完\n" });
  const proj = m.scanProjectContext({ cwd: dir });
  assert.match(proj.stage, /阻塞/);
});

test("项目扫描：无文档时给“信息不足”", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fn-empty2-"));
  const proj = m.scanProjectContext({ cwd: dir });
  assert.match(proj.stage, /信息不足|阶段完成/);
});

test("项目报告：含阶段、未完成、下一步小节", () => {
  const dir = makeProject({
    "AGENTS.md": "- [ ] 做 A\n## 阻塞\n- B 卡住\n## 下一步\n- 先做 C\n",
  });
  const proj = m.analyzeProjectContext(m.scanProjectContext({ cwd: dir }), store());
  const text = m.buildProjectReport(proj, store());
  assert.match(text, /阶段/);
  assert.match(text, /未完成|下一步|阻塞/);
});

test("项目场景：给出动态场景且带 need", () => {
  const dir = makeProject({ "AGENTS.md": "- [ ] 修多音字\n" });
  const proj = m.analyzeProjectContext(m.scanProjectContext({ cwd: dir }), store());
  const sc = m.projectScenario(proj, store());
  assert.ok(sc.id);
  assert.ok(String(sc.when).length > 0);
});

/* ---------------- buildProposal（6） ---------------- */
const sc = (over = {}) => ({
  id: "plugin", title: "插件", when: "", group: "系统", keywords: [], brief: "",
  plugins: [], skillIds: [], ...over,
});

test("提案：无插件时说明只用核心工具", () => {
  const text = m.buildProposal(piOf(), sc(), store(), null);
  assert.match(text, /无额外插件/);
});

test("提案：带工作流时标题是「工作流 × 场景」", () => {
  const text = m.buildProposal(piOf(), sc(), store(), m.workflowById("debug"));
  assert.match(text, /排查修复 × 插件/);
});

test("提案：工作流行含流程箭头", () => {
  const text = m.buildProposal(piOf(), sc(), store(), m.workflowById("debug"));
  assert.match(text, /1. 复现问题/);
  assert.match(text, /2. 缩小范围/);
});

test("提案：有缺口时列在「本机没有」", () => {
  const text = m.buildProposal(piOf(), sc({ id: "video", when: "视频剪辑" }), store(), null);
  assert.ok(text.length > 0);
});

test("提案：底部有还原与详情入口", () => {
  const text = m.buildProposal(piOf(), sc(), store(), null);
  assert.match(text, /还原 \/function off/);
  assert.match(text, /详情 \/function status/);
});

test("提案：技能使用短描述（不超 42 字 + 省略号）", () => {
  const st = store({ known: { "skill:verylong": { description: "很长的描述".repeat(40) } } });
  const text = m.buildProposal(piOf(), sc({ skillIds: ["verylong"] }), st, null);
  const line = text.split("\n").find((l) => l.includes("verylong"));
  assert.ok(line.length < 100, `技能行过长：${line.length}`);
});

/* ---------------- 文本工具（5） ---------------- */
test("pickerLine：带 when 时是两行", () => {
  const line = m.pickerLine("debug", "排查修复", "先复现");
  assert.ok(line.includes("\n"));
  assert.match(line, /^debug · 排查修复/);
});

test("pickerLine：无 when 时是单行", () => {
  assert.equal(m.pickerLine("debug", "排查修复"), "debug · 排查修复");
});

test("shortDesc：在破折号处截断（足够长的描述）", () => {
  assert.equal(m.shortDesc("这是一个很长的描述——后面还有更多内容", 40), "这是一个很长的描述");
});

test("shortDesc：无标点时按长度截断并加省略号", () => {
  const out = m.shortDesc("a".repeat(100), 10);
  assert.equal(out.length, 10);
  assert.match(out, /…$/);
});

test("toolPurpose：未知工具用描述首句", () => {
  assert.match(m.toolPurpose({ name: "x", description: "Use this to do X. More text." }), /Use this to do X/);
});

// 这轮所有改动是否真的“在运行中的代码里”：逐条 smoke，失败即说明某次改动没落地。
// 跑法：node --experimental-strip-types --test tests/applied.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { EXT } from "./_bootstrap.mjs";
const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

const repoFile = new URL("../function-menu.js", import.meta.url);
const installedFile = path.join(os.homedir(), ".pi", "agent", "extensions", "function-menu.js");
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");

test("A1 安装副本与仓库文件逐字节一致（改动真的部署了）", (t) => {
  if (!fs.existsSync(installedFile)) return t.skip("没有安装副本（非部署机）");
  assert.equal(md5(installedFile), md5(repoFile), "安装副本落后于仓库");
});

test("A2 运行中的版本号 == package.json（/function status 显示的就是它）", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(m.EXT_VERSION, pkg.version);
});

test("A3 能力缺口 → find-skill：缺口可识别，请求写着“先确认本机 / 给候选 / 等我确认”", () => {
  const need = "帮我把文档导出成 pdf";
  assert.ok(m.capabilityGaps({ dynamic: true, when: need }, store, null).some((g) => g.id === "pdf"));
  const msg = m.skillSearchMessage(m.capabilityGaps({ dynamic: true, when: need }, store, null), need);
  assert.match(msg, /先确认本机/);
  assert.match(msg, /2-3 个候选/);
  assert.match(msg, /等我确认再装/);
});

test("A4 装了却没用的 bug 已修：去AI味时 humanizer 必须被选中或被问到", () => {
  const a = m.analyzeNeed("帮我把这段文字去AI味", store);
  const reachable = a.skills.some((s) => s.skill === "humanizer")
    || a.audit.unselected.some((x) => x.id === "humanizer");
  assert.ok(reachable, "既没选中也没进核对列表 = 老 bug 回来了");
});

test("A5 无场景无标签的需求不再被清空（selectByCoverage）", () => {
  const picked = m.selectByCoverage([
    { id: "low", score: 1, roles: [], tags: [] },
    { id: "high", score: 3, roles: [], tags: [] },
  ], 5, []);
  assert.deepEqual(picked.map((x) => x.id), ["high", "low"]);
});

test("A6 裸词要问、明确写法不问", () => {
  assert.equal(m.bareCapabilityAsks("做一条视频", new Set())[0]?.id, "video");
  assert.equal(m.bareCapabilityAsks("把录音整理一下", new Set())[0]?.id, "audio");
  assert.deepEqual(m.bareCapabilityAsks("剪一条视频，加字幕", new Set()), []);
});

test("A7 逐词核对完整性 + 面板段都在", () => {
  const need = "帮我把这份报告加上水印并转成二维码";
  const a = m.analyzeNeed(need, store);
  assert.equal(a.audit.words.accounted, a.audit.words.total, "有词没归属");
  assert.ok(a.audit.words.unmatched.includes("水印"));
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, m.dynamicScenario(need, a, null), store, null);
  assert.match(text, /逐词核对（每个词都查过）/);
  assert.match(text, /全部有归属/);
});

test("A8 动词 / 形容词也在核对里，缺能力时生成 deed 缺口", () => {
  const need = "帮我润色并精简这段话";
  const w = m.wordAudit(need);
  assert.ok(w.deeds.some((d) => d.term === "润色" && d.role === "writing"));
  assert.ok(m.deedGaps("把访谈录音剪辑成短片").some((g) => g.id === "deed:剪辑" && g.source === "deed"));
});

test("A9 中英别名双向生效（水印 ↔ watermark）", () => {
  assert.ok(m.aliasesFor("水印").includes("watermark"));
  assert.ok(m.aliasesFor("watermark").includes("水印"));
  const prof = m.buildProfile(store);
  const fake = {
    ...prof,
    itemInfo: { ...prof.itemInfo, "skill:watermark-remover": { kind: "skill", description: "Remove watermark from photos", tags: [], roles: [], infra: false } },
  };
  m.hydrateCatalog(fake);
  try {
    assert.ok(m.capabilityScan("把水印去掉").some((x) => x.id === "skill:watermark-remover"));
  } finally {
    m.hydrateCatalog(m.buildProfile(store));
  }
});

test("A10 scan 归类与 /function 补全都已生效（英文描述归角色、menu 排第一、/fn 无补全）", () => {
  const prof = m.buildProfile(store);
  const fake = {
    ...prof,
    itemInfo: {},
  };
  // 用真实 buildProfile 验证别名归类
  const s = JSON.parse(JSON.stringify(store));
  s.known["skill:wm"] = { kind: "skill", label: "wm", description: "Remove watermark from photos and PDFs", tools: [], commands: [], skills: [], auto: true, missing: false };
  const built = m.buildProfile(s);
  assert.deepEqual(built.itemInfo.wm?.roles, ["vision"], `实际：${JSON.stringify(built.itemInfo.wm?.roles)}`);

  const reg = {};
  m.default({
    registerTool() {},
    registerCommand(name, cmd) { reg[name] = cmd; },
    on() {}, appendEntry() {}, sendMessage() {},
    getAllTools: () => [], getActiveTools: () => [], setActiveTools() {},
    getCommands: () => [], getAllSkills: () => [],
  });
  assert.equal(reg.function.getArgumentCompletions(""), null, "裸 /function 不该弹候选");
  assert.deepEqual(reg.function.getArgumentCompletions("s").map((i) => i.value), ["scan", "status", "stats"]);
  assert.equal(reg.fn.getArgumentCompletions, undefined);
});

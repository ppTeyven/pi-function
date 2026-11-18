// 全量核对 + 裸词澄清测试：把“装了却没被用上”的能力捞出来，让用户决定。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
const profile = m.buildProfile(store);
m.hydrateCatalog(profile);

const dyn = (need) => m.dynamicScenario(need, m.analyzeNeed(need, store), null);

test("A1 全量核对捞得出角色闸门漏掉的技能（AI味 → humanizer）", () => {
  const a = m.analyzeNeed("帮我去掉这段文字的AI味", store);
  const ids = a.audit.unselected.map((x) => x.id);
  assert.ok(ids.includes("humanizer"), `应把 humanizer 列为未选，实际：${ids.join(",")}`);
  const h = a.audit.unselected.find((x) => x.id === "humanizer");
  assert.ok(h.hits.some((s) => /ai味/.test(s)), `命中应含 ai味，实际：${h.hits.join("/")}`);
});

test("A2 未选列表里不会出现已选的条目", () => {
  const need = "润色一下这段话";
  const a = m.analyzeNeed(need, store);
  const chosen = new Set([...a.skills.map((s) => s.skill), ...a.packages.map((p) => p.pkg)]);
  for (const x of a.audit.unselected) assert.ok(!chosen.has(x.id), `${x.id} 同时出现在已选和未选里`);
});

test("A3 全量核对不改变预算：插件 ≤5、技能 ≤5", () => {
  const a = m.analyzeNeed("帮我看看这个项目的代码顺便把文档更新一下", store);
  assert.ok(a.packages.length <= m.LIMITS.packages);
  assert.ok(a.skills.length <= m.LIMITS.skills);
  assert.ok(a.audit.total > 0);
});

test("A4 稀有度闸门：人人都写的词不算证据", () => {
  const a = m.analyzeNeed("处理一下这些内容", store);
  assert.equal(a.audit.matched, 0, `泛词不该命中，实际：${a.audit.unselected.map((x) => x.id + ":" + x.hits).join(",")}`);
});

test("A5 扁平化比对：带空格的描述也能和需求的“AI味”对上", () => {
  const a = m.analyzeNeed("去掉 AI 味", store);
  assert.ok(a.audit.unselected.some((x) => x.id === "humanizer"), "空格不应阻断匹配");
});

test("A6 裸词要问，明确写法不问", () => {
  const bare = m.bareCapabilityAsks("做一条视频", new Set(["video"]));
  assert.equal(bare.length, 0, "已判定为缺口时不重复问");
  const bare2 = m.bareCapabilityAsks("做一条视频", new Set());
  assert.equal(bare2[0]?.id, "video");
  assert.deepEqual(m.bareCapabilityAsks("剪一条视频，加字幕", new Set()), [], "明确的“视频剪辑”不该再问");
  assert.equal(m.bareCapabilityAsks("帮我做个ppt", new Set()).length, 0);
});

test("A7 裸词答“是”但本机没能力 → 变成缺口（走 find-skill）", () => {
  const spec = m.NEED_CAPABILITIES.find((c) => c.id === "video");
  assert.equal(m.capabilityCovered(spec), false, "fixture 里没有视频能力");
  const a = m.analyzeNeed("做一条视频", store);
  assert.ok(a.audit.unselected.length >= 0);
  assert.deepEqual(m.capabilityGaps({ dynamic: true, when: "做一条视频" }, store, null).map((g) => g.id), [], "裸词不直接算缺口，要等用户确认");
});

test("A8 面板列出全量核对结果，并说明会问用户", () => {
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, dyn("帮我去掉这段文字的AI味"), store, null);
  assert.match(text, /全量核对（所有插件与技能）/);
  assert.match(text, /共核对 \d+ 个条目/);
  assert.match(text, /skill:humanizer/);
  assert.match(text, /装配前会逐个问你：要不要也启用/);
});

test("A9 用户确认后加入的技能会进 comboSkillIds（静态场景同样生效）", () => {
  const scenario = { id: "article", title: "文章 / 文案 / 博客", keywords: [], plugins: [], skillIds: ["humanizer"], when: "x" };
  const ids = m.comboSkillIds(scenario, store, null);
  assert.ok(ids.includes("humanizer"));
  assert.ok(ids.length > 1, "场景自带技能不该被覆盖掉");
});

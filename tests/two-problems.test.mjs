// 两个问题的专项回归：① 装了 skill 却没被用上；② 裸词靠猜。
// 每条用例只对一个可观测行为负责，失败时能直接指出是哪一半坏了。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, STORE } from "./_bootstrap.mjs";
const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

const dyn = (need) => m.dynamicScenario(need, m.analyzeNeed(need, store), null);
const nonInfraCount = () => Object.values(m.buildProfile(store).itemInfo).filter((i) => !i.infra).length;

// ==== 问题一：装了却没被用上 ================================================

test("P1 需求没有可覆盖标签时，候选不得被静默清空（原始 bug）", () => {
  const cands = [
    { id: "low", score: 1.1, roles: [], tags: [] },
    { id: "high", score: 2.4, roles: [], tags: [] },
  ];
  assert.deepEqual(m.selectByCoverage(cands, 3, []).map((x) => x.id), ["high", "low"]);
});

test("P2 去AI味：humanizer 要么被选中，要么被问——不能两处都不见", () => {
  const a = m.analyzeNeed("帮我把这段文字去AI味", store);
  const selected = a.skills.some((s) => s.skill === "humanizer");
  const asked = a.audit.unselected.some((x) => x.id === "humanizer");
  assert.ok(selected || asked, "既没选中也没进核对列表——回到“装了不用”的 bug");
});

test("P3 全量核对能捞出闸门漏掉的条目（爬虫 → cron）", () => {
  const a = m.analyzeNeed("写个爬虫抓数据", store);
  const listed = a.audit.unselected.map((x) => x.id);
  assert.ok(listed.includes("cron"), `未列出：${listed.join(",")}`);
  assert.ok(!a.skills.some((s) => s.skill === "cron"), "未选项不能同时被自动选中");
});

test("P4 核对覆盖全部非 infra 条目", () => {
  const a = m.analyzeNeed("随便看看", store);
  assert.equal(a.audit.total, nonInfraCount());
});

test("P5 已选与未选互斥", () => {
  const a = m.analyzeNeed("我要做下面的ppt和pdf", store);
  const chosen = new Set([...a.skills.map((s) => s.skill), ...a.packages.map((p) => p.pkg)]);
  for (const x of a.audit.unselected) assert.ok(!chosen.has(x.id), `${x.id} 同时出现在两边`);
});

test("P6 泛词不构成证据（内容 / 处理）", () => {
  const a = m.analyzeNeed("处理一下这些内容", store);
  assert.equal(a.audit.matched, 0, `实际命中：${a.audit.unselected.map((x) => x.id).join(",")}`);
});

test("P7 描述带空格也能对上（去除 AI 味 vs AI味）", () => {
  const a = m.analyzeNeed("去掉 AI 味", store);
  const seen = [...a.skills.map((s) => s.skill), ...a.audit.unselected.map((x) => x.id)];
  assert.ok(seen.includes("humanizer"), "空格不应阻断匹配");
});

test("P8 方向敏感：PDF→Markdown 转换器不算“能生成 PDF”", () => {
  const fake = {
    ...m.buildProfile(store),
    itemInfo: {
      ...m.buildProfile(store).itemInfo,
      "skill:markdown-converter": { kind: "skill", description: "Convert PDF, Word (.docx) and PPTX files to Markdown", tags: [], roles: [], infra: false },
    },
  };
  m.hydrateCatalog(fake);
  try {
    const pdf = m.NEED_CAPABILITIES.find((c) => c.id === "pdf");
    assert.equal(m.capabilityCovered(pdf), false, "PDF→Markdown 不能被当成能生成 PDF");
  } finally {
    m.hydrateCatalog(m.buildProfile(store));
  }
});

test("P9 未选项按分数降序，且一次最多问 3 个", () => {
  const a = m.analyzeNeed("我要做下面的ppt和pdf", store);
  assert.ok(a.audit.unselected.length <= 6, "未选项列表不超过 6");
  const scores = a.audit.unselected.map((x) => x.score);
  assert.deepEqual([...scores].sort((x, y) => y - x), scores, "未选项必须按分数降序");
  const asks = m.auditAskList(dyn("我要做下面的ppt和pdf"), 3);
  assert.ok(asks.length <= 3, `一次最多问 3 个，实际 ${asks.length}`);
  assert.ok(asks.length > 0, "有相关未选项时必须进询问队列");
});

test("P10 面板写清“核对了多少、还差谁、会问你”", () => {
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, dyn("帮我把这段文字去AI味"), store, null);
  assert.match(text, /全量核对（所有插件与技能）/);
  assert.match(text, /共核对 \d+ 个条目/);
  assert.match(text, /装配前会逐个问你：要不要也启用/);
});

// ==== 问题二：裸词必须问，不许猜 ============================================

test("P11 裸词「视频」要问，且问题给出是/否后果", () => {
  const [ask] = m.bareCapabilityAsks("做一条视频", new Set());
  assert.equal(ask?.id, "video");
  assert.match(ask.question, /要.*吗？/);
});

test("P12 明确写法不问（视频剪辑 / 加字幕）", () => {
  assert.deepEqual(m.bareCapabilityAsks("剪一条视频，加字幕", new Set()), []);
  assert.deepEqual(m.bareCapabilityAsks("做个视频剪辑", new Set()), []);
});

test("P13 已判定为缺口时不重复问", () => {
  assert.deepEqual(m.bareCapabilityAsks("做一条视频", new Set(["video"])), []);
});

test("P14 音频与 OCR 的裸词同样要问", () => {
  assert.equal(m.bareCapabilityAsks("把录音整理一下", new Set())[0]?.id, "audio");
  assert.equal(m.bareCapabilityAsks("这张截图里写了什么", new Set())[0]?.id, "ocr");
});

test("P15 一次最多问 2 个裸词，不轰炸", () => {
  const asks = m.bareCapabilityAsks("做个视频，整理录音，再看看截图", new Set());
  assert.equal(asks.length, 2);
});

test("P16 答「是」且本机没能力 → 变成缺口，交给 find-skill", () => {
  const gaps = m.bareGapsFromAnswers("做一条视频", [], ["video"]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].id, "video");
  assert.equal(gaps[0].source, "need");
});

test("P17 答「否」→ 不算需求，不产生缺口", () => {
  assert.deepEqual(m.bareGapsFromAnswers("做一条视频", [], []), []);
});

test("P18 用户没回答之前不算缺口（不猜）", () => {
  assert.deepEqual(m.capabilityGaps({ dynamic: true, when: "做一条视频" }, store, null), []);
});

test("P19 答「是」但本机确实有能力 → 不产生缺口", () => {
  const fake = {
    ...m.buildProfile(store),
    itemInfo: {
      ...m.buildProfile(store).itemInfo,
      "skill:video-cut": { kind: "skill", description: "视频剪辑与字幕合成，ffmpeg 渲染", tags: [], roles: [], infra: false },
    },
  };
  m.hydrateCatalog(fake);
  try {
    assert.equal(m.capabilityCovered(m.NEED_CAPABILITIES.find((c) => c.id === "video")), true);
    assert.deepEqual(m.bareGapsFromAnswers("做一条视频", [], ["video"]), []);
  } finally {
    m.hydrateCatalog(m.buildProfile(store));
  }
});

test("P20 端到端：裸词真的弹了确认，答是后把找技能请求交出去", async () => {
  const state = { active: ["read"], notices: [], messages: [], entries: [], run: null, confirms: [] };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) {
      if (name === "function") state.run = cmd.handler || cmd;
    },
    on() {},
    appendEntry: (type, d) => state.entries.push({ type, d }),
    sendMessage: (msg) => state.messages.push(msg),
    getAllTools: () => [{ name: "read", sourceInfo: { path: "builtin:read" } }],
    getActiveTools: () => state.active,
    setActiveTools: (next) => { state.active = next; },
    getCommands: () => [],
    getAllSkills: () => [],
  };
  m.default(pi);
  const ctx = {
    hasUI: true,
    ui: {
      notify: (text) => state.notices.push(String(text)),
      confirm: async (title) => { state.confirms.push(String(title)); return true; },
      input: async () => "direct",
      select: async () => null,
      setEditorText: (text) => state.text = text,
    },
  };
  await state.run("做一条视频", ctx);
  const asked = state.confirms.join("\n");
  assert.match(asked, /需求里提到「视频/, "必须为裸词提问");
  assert.match(asked, /本机没有「视频/, "答是后应转入能力缺口询问");
  assert.ok(
    state.notices.some((n) => /find-skill|输入框/.test(n)),
    `应把找技能的请求交出去，实际通知：${state.notices.join(" | ")}`,
  );
});

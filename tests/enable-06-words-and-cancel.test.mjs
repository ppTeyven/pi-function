// 第 6 组：需求词过滤（别再问蠢问题）+ 取消装配的完整语义
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, hydrate, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

/* ==================== A. 词过滤：什么不该问（16） ==================== */
test("词过滤：纯数字不问（50 / 3.5）", () => {
  assert.equal(m.isAskableTerm("50"), false);
  assert.equal(m.isAskableTerm("3.5"), false);
});

test("词过滤：数字+量词不问（3 个 / 5 天）", () => {
  assert.equal(m.isAskableTerm("3个"), false);
  assert.equal(m.isAskableTerm("5天"), false);
});

test("词过滤：范围词不问（整个/全部/所有）", () => {
  for (const w of ["整个", "全部", "所有", "整体", "全局"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("词过滤：抽象名词不问（反应/效果/情况）", () => {
  for (const w of ["反应", "效果", "情况", "状态", "表现"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("词过滤：操作动词不问（取消/优化/修复）", () => {
  for (const w of ["取消", "优化", "修复", "调整", "重试"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("词过滤：排查/分析/测试这类动作词不问", () => {
  for (const w of ["排查", "分析", "测试", "验证"]) assert.equal(m.isAskableTerm(w), false, w);
});

test("词过滤：3d / 2k 这类数字缩写不问", () => {
  assert.equal(m.isAskableTerm("3d"), false);
  assert.equal(m.isAskableTerm("2k"), false);
});

test("词过滤：分词碎片不问（d建模）", () => {
  assert.equal(m.isAskableTerm("d建模"), false);
});

test("词过滤：量词开头的两字词不问（首歌）", () => {
  assert.equal(m.isAskableTerm("首歌"), false);
  assert.equal(m.isAskableTerm("个方案"), false);
});

test("词过滤：单字不问", () => {
  assert.equal(m.isAskableTerm("水"), false);
});

test("词过滤：1-2 个字母的缩写不问（a / ui）", () => {
  assert.equal(m.isAskableTerm("a"), false);
  assert.equal(m.isAskableTerm("ui"), false);
});

test("词过滤：真正的交付物词要保留（水印）", () => {
  assert.equal(m.isAskableTerm("水印"), true);
});

test("词过滤：复合能力词要保留（数据分析）", () => {
  assert.equal(m.isAskableTerm("数据分析"), true);
});

test("词过滤：空值/null 不问", () => {
  assert.equal(m.isAskableTerm(""), false);
  assert.equal(m.isAskableTerm(null), false);
  assert.equal(m.isAskableTerm(undefined), false);
});

test("词过滤：WORD_ASK_STOP 覆盖用户截图里的四个词", () => {
  for (const w of ["取消", "整个", "反应"]) assert.ok(m.WORD_ASK_STOP.has(w), w);
  assert.equal(m.isAskableTerm("50"), false);
});

test("词过滤：过滤表不影响 GENERIC_TERMS（各管各的）", () => {
  assert.ok(m.GENERIC_TERMS.has("tool"));
  assert.equal(m.WORD_ASK_STOP.has("tool"), false);
});

/* ==================== B. unknownWordAsks（10） ==================== */
hydrate(m, {
  "code-intel": { packages: ["pi-lens"] },
  testing: { packages: ["pi-test"] },
});

test("提问：截图里的需求一个都不问（50/取消/整个/反应）", () => {
  const wa = m.wordAudit("再写50个测试继续排查bug，而且我希望你优化一下用户取消后整个插件的反应");
  const asks = m.unknownWordAsks(wa, 3);
  assert.deepEqual(asks.map((a) => a.label), [], `不该问：${asks.map((a) => a.label)}`);
});

test("提问：真正的缺口词仍会问（水印）", () => {
  const wa = m.wordAudit("给视频加水印");
  const asks = m.unknownWordAsks(wa, 3);
  assert.ok(asks.some((a) => a.label.includes("水印")), `应问水印：${asks.map((a) => a.label)}`);
});

test("提问：多个可问词合并成一次提问", () => {
  const words = { unmatched: ["水印", "配音"], unmatchedPhrases: [] };
  const asks = m.unknownWordAsks(words, 3);
  assert.equal(asks.length, 1, "多个词只弹一次");
  assert.ok(asks[0].id.startsWith("words:"), asks[0].id);
});

test("提问：合并提问的 label 用、连接", () => {
  const words = { unmatched: ["水印", "配音"], unmatchedPhrases: [] };
  const [ask] = m.unknownWordAsks(words, 3);
  assert.match(ask.label, /、/);
});

test("提问：合并后的提问带 merged 标记", () => {
  const words = { unmatched: ["水印", "配音"], unmatchedPhrases: [] };
  const [ask] = m.unknownWordAsks(words, 3);
  assert.equal(ask.merged, true);
});

test("提问：单个词不合并，直接问它", () => {
  const words = { unmatched: ["水印"], unmatchedPhrases: [] };
  const asks = m.unknownWordAsks(words, 3);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].label, "水印");
  assert.equal(asks[0].merged, undefined);
});

test("提问：没问题词时返回空数组（不弹任何窗）", () => {
  const wa = m.wordAudit("优化一下这个功能");
  assert.deepEqual(m.unknownWordAsks(wa, 3), []);
});

test("提问：合并时的数量受 max 限制", () => {
  const words = { unmatched: ["水印", "配音", "字幕", "转场", "调色"], unmatchedPhrases: [] };
  const asks = m.unknownWordAsks(words, 2);
  assert.equal(asks.length, 1);
  assert.ok(asks[0].label.split("、").length <= 2);
});

test("提问：英文长词仍可问（webgpu）", () => {
  const words = { unmatched: ["webgpu"], unmatchedPhrases: [] };
  const asks = m.unknownWordAsks(words, 3);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].label, "webgpu");
});

test("提问：提问文案不再说「这整件事是你要做的吗」", () => {
  const wa = m.wordAudit("给视频加水印");
  const asks = m.unknownWordAsks(wa, 3);
  for (const a of asks) assert.ok(!a.question.includes("整件事"), a.question);
});

/* ==================== C. wordGapsFromAnswers（6） ==================== */
test("回答：合并 id（words:a|b）拆成多个缺口", () => {
  const gaps = m.wordGapsFromAnswers({ unmatched: ["水印", "配音"], unmatchedPhrases: [] }, ["words:水印|配音"]);
  assert.deepEqual(gaps.map((g) => g.label).sort(), ["水印", "配音"]);
});

test("回答：单词 id（word:水印）返回一个缺口", () => {
  const gaps = m.wordGapsFromAnswers({ unmatched: ["水印"], unmatchedPhrases: [] }, ["word:水印"]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].label, "水印");
});

test("回答：短语 id（phrase:xxx）返回缺口", () => {
  const gaps = m.wordGapsFromAnswers({ unmatched: [], unmatchedPhrases: ["3D打印"] }, ["phrase:3D打印"]);
  assert.equal(gaps.length, 1);
});

test("回答：没答是就不产生缺口", () => {
  assert.deepEqual(m.wordGapsFromAnswers({ unmatched: ["水印"], unmatchedPhrases: [] }, []), []);
});

test("回答：缺口带 source=word（便于追溯）", () => {
  const [g] = m.wordGapsFromAnswers({ unmatched: ["水印"], unmatchedPhrases: [] }, ["word:水印"]);
  assert.equal(g.source, "word");
});

test("回答：合并 id 去重（同一词只算一次）", () => {
  const gaps = m.wordGapsFromAnswers({ unmatched: ["水印"], unmatchedPhrases: [] }, ["words:水印|水印", "word:水印"]);
  assert.equal(gaps.filter((g) => g.label === "水印").length, 1);
});

/* ==================== D. pickAnswer（8） ==================== */
const OPTS = ["✓ 是 — 一并启用", "否 — 不启用", "✕ 取消 — 放弃本次装配（工具集不动）"];

test("回答归一：undefined（Esc）= 取消", () => {
  assert.equal(m.pickAnswer(undefined, OPTS), "cancel");
});

test("回答归一：null = 取消", () => {
  assert.equal(m.pickAnswer(null, OPTS), "cancel");
});

test("回答归一：选「是」= yes", () => {
  assert.equal(m.pickAnswer(OPTS[0], OPTS), "yes");
});

test("回答归一：选「否」= no", () => {
  assert.equal(m.pickAnswer(OPTS[1], OPTS), "no");
});

test("回答归一：选「取消」= cancel", () => {
  assert.equal(m.pickAnswer(OPTS[2], OPTS), "cancel");
});

test("回答归一：任何以取消开头的文本都算取消", () => {
  assert.equal(m.pickAnswer("取消本次装配", OPTS), "cancel");
});

test("回答归一：以 ✓ 开头的自定义文本算 yes", () => {
  assert.equal(m.pickAnswer("✓ 是 — 别的说法", OPTS), "yes");
});

test("回答归一：不认识的自定义文本兜底为 no（不误装配）", () => {
  assert.equal(m.pickAnswer("随便写点什么", OPTS), "no");
});

/* ==================== E. 取消装配的行为（10） ==================== */
function env() {
  const tools = [
    ...coreTools(),
    ...pkgTools("pi-lens", ["lens_diagnostics"]),
    tool("unrelated_tool", { path: "/x/node_modules/@example/unrelated/dist/index.js", source: "npm:@example/unrelated" }),
  ];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  const cmd = state.commands.get("function");
  return { state, pi, run: (args, opts) => cmd.handler(args, makeCtx(state, opts)) };
}

test("拒绝新的装配提案：保留已启用的工作流、工具、会话记录，不发找技能请求", async () => {
  const { state, run } = env();
  await run("workflow", { selects: ["debug", "✓ 完成选择"] });
  const before = { tools: [...state.active], writes: state.setCalls.length, entries: state.entries.length };
  await run("plugin", { confirms: [false] });
  assert.deepEqual(state.active, before.tools);
  assert.equal(state.setCalls.length, before.writes);
  assert.equal(state.entries.length, before.entries);
  assert.equal(state.userMessages.length, 0);
  assert.equal(m.loadStore().active.workflow, "debug");
  assert.match(noticeText(state), /已取消，未做任何改动/);
});

test("工作流多选：选中后按 Esc，不用当前选择进行装配", async () => {
  const { state, run } = env();
  await run("workflow", { selects: ["debug", undefined] });
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.entries.length, 0);
  assert.match(noticeText(state), /已取消/);
});

test("菜单装配：在能力追问中取消，不装配、不去找技能", async () => {
  const { state, run } = env();
  const before = [...state.active];
  await run("assemble", { selects: ["direct", "✓ 完成选择", "data", "✓ 完成选择"], confirms: [true] });
  assert.ok(state.selectCalls.some(call => call.options.some(option => option.startsWith("✕ 取消"))), "必须真的到达追问阶段");
  assert.deepEqual(state.active, before);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.entries.length, 0);
  assert.equal(state.userMessages.length, 0);
  assert.match(noticeText(state), /已取消装配/);
});

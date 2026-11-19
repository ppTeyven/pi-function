// 逐词核对：需求里的每个词都要被看过，没覆盖的词要问，不许自己判定“不重要”。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

test("W1 分词保留真词：ppt / pdf / 水印 / 二维码 各算一个词", () => {
  const toks = m.wordTokens("帮我把这份报告加上水印并转成二维码，再配个ppt和pdf");
  for (const w of ["报告", "水印", "二维码", "ppt", "pdf"]) assert.ok(toks.includes(w), `缺少词 ${w}：${toks.join(",")}`);
});

test("W2 全库没提到的词会进 unmatched（水印 / 二维码）", () => {
  const w = m.wordAudit("帮我把这份报告加上水印并转成二维码");
  assert.ok(w.unmatched.includes("水印"), `实际：${w.unmatched.join(",")}`);
  assert.ok(w.unmatched.includes("二维码"), `实际：${w.unmatched.join(",")}`);
});

test("W3 虚词 / 量词不产生询问", () => {
  const w = m.wordAudit("帮我把这份加上一下这个");
  assert.deepEqual(w.unmatched, [], `实际：${w.unmatched.join(",")}`);
});

test("W4 已匹配到条目的词不进 unmatched，并附上最强条目", () => {
  const w = m.wordAudit("帮我把这段文字去AI味");
  assert.ok(!w.unmatched.includes("ai味"));
  const hit = w.matched.find((x) => x.term === "ai味");
  assert.equal(hit?.item, "humanizer");
});

test("W5 单字不当作匹配证据（避免“的 → sop-builder”这种噪声）", () => {
  const w = m.wordAudit("我要做下面的ppt和pdf");
  assert.ok(w.matched.every((x) => x.term.length >= 2), `出现单字证据：${w.matched.map((x) => x.term).join(",")}`);
});

test("W6 未覆盖词的询问带原词，且 id 可追溯", () => {
  const asks = m.unknownWordAsks({ unmatched: ["水印", "二维码", "报告"] }, 2);
  assert.equal(asks.length, 2);
  assert.equal(asks[0].id, "word:水印");
  assert.match(asks[0].question, /都没提到「水印」/);
});

test("W7 答“是”才生成 word 缺口", () => {
  const words = { unmatched: ["水印", "二维码"] };
  assert.deepEqual(m.wordGapsFromAnswers(words, []), []);
  const gaps = m.wordGapsFromAnswers(words, ["word:水印"]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].label, "水印");
  assert.equal(gaps[0].source, "word");
});

test("W8 analyzeNeed 会带上逐词核对结果，面板也列出来", () => {
  const need = "帮我把这份报告加上水印";
  const a = m.analyzeNeed(need, store);
  assert.ok(a.audit.words.total > 0, "没有逐词结果");
  assert.ok(a.audit.words.unmatched.includes("水印"));
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, m.dynamicScenario(need, a, null), store, null);
  assert.match(text, /逐词核对（每个词都有归属）/);
  assert.match(text, /本机没提到：.*「水印」/);
});

test("W9 没有 Intl.Segmenter 时退回滑窗，仍然不丢词", () => {
  const saved = Intl.Segmenter;
  try {
    // @ts-ignore 故意打掉分词器
    Intl.Segmenter = undefined;
    const toks = m.wordTokens("把水印加上");
    assert.ok(toks.includes("水印"), `退回路径丢词：${toks.join(",")}`);
  } finally {
    Intl.Segmenter = saved;
  }
});

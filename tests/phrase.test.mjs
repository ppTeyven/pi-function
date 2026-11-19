// 需求是一句话，不是一个词表：相邻的词要连起来看，不能拆开逐字追问。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT } from "./_bootstrap.mjs";
const m = await import(EXT);

const item = (id, text) => ({ id, kind: "skill", text, scan: text });
const auditWith = (need, texts) => m.wordAudit(need, texts.map((t, i) => item(`skill:q${i}`, t)));

test("G1 整串出现在目录里时按组合理解，不再拆成孤字", () => {
  // 单词各自到处都是（通用词），只有整串才指向唯一一个条目——这正是要组合看的情形。
  const texts = [
    ...Array.from({ length: 10 }, (_, i) => `安排日程 ${i}`),
    ...Array.from({ length: 10 }, (_, i) => `内容组合 ${i}`),
    "重新安排组合 成新的搭配",
  ];
  const w = auditWith("重新安排组合", texts);
  assert.ok((w.counts.compound || 0) >= 2, `compound=${w.counts.compound}`);
  assert.ok(!w.unmatched.includes("安排"), `安排 仍被当成孤立缺口：${w.unmatched.join(",")}`);
  assert.ok(!w.unmatched.includes("组合"), `组合 仍被当成孤立缺口：${w.unmatched.join(",")}`);
  assert.ok(w.phrases.length >= 1, "没有记录组合命中");
  assert.ok(w.phrases[0].phrase.includes("安排"), `组合短语不对：${w.phrases[0].phrase}`);
});

test("G2 加入组合桶后仍满足完整性不变式", () => {
  const w = auditWith("重新安排组合并且润色一下", ["重新安排组合"]);
  assert.equal(w.accounted, w.total);
  assert.equal(Object.values(w.counts).reduce((a, b) => a + b, 0), w.total);
});

test("G3 提问按短语问一次，而不是每个字问一遍", () => {
  const w = auditWith("重新安排组合", ["完全无关的描述"]);
  assert.ok(w.unmatchedPhrases.length >= 1, "没有归组短语");
  const asks = m.unknownWordAsks(w, 3);
  assert.equal(asks.length, 1, `问了 ${asks.length} 个问题：${asks.map((a) => a.label).join(",")}`);
  assert.ok(asks[0].id.startsWith("phrase:"), `提问 id 不是短语：${asks[0].id}`);
  assert.equal(asks[0].label, w.unmatchedPhrases[0]);
});

test("G4 答“是”的短语会变成一个缺口（去 find-skill）", () => {
  const words = { unmatched: ["安排", "组合"], unmatchedPhrases: ["安排组合"] };
  const gaps = m.wordGapsFromAnswers(words, ["phrase:安排组合"]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].id, "phrase:安排组合");
  assert.equal(gaps[0].label, "安排组合");
});

test("G5 没有短语可归组时才退回单词，且不重复", () => {
  const asks = m.unknownWordAsks({ unmatched: ["水印", "二维码"], unmatchedPhrases: [] }, 2);
  assert.deepEqual(asks.map((a) => a.id), ["word:水印", "word:二维码"]);
  assert.equal(new Set(asks.map((a) => a.label)).size, asks.length);
});

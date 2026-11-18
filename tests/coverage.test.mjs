// 完全覆盖：中英对照 + 每个条目都参与比对 + 没问到的词也必须出现在提示里。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
const base = m.buildProfile(store);
m.hydrateCatalog(base);

const withItem = (id, description) => {
  const prof = m.buildProfile(store);
  const fake = { ...prof, itemInfo: { ...prof.itemInfo, [id]: { kind: "skill", description, tags: [], roles: [], infra: false } } };
  m.hydrateCatalog(fake);
  return () => m.hydrateCatalog(m.buildProfile(store));
};

test("V1 中文需求 + 英文描述：水印 ↔ watermark 能对上", () => {
  const restore = withItem("skill:watermark-remover", "Remove watermark from photos and PDFs");
  try {
    const w = m.wordAudit("帮我把这张图的水印去掉");
    assert.ok(w.matched.some((x) => x.term === "水印" && x.item === "skill:watermark-remover"), `实际：${JSON.stringify(w.matched)}`);
  } finally {
    restore();
  }
});

test("V2 英文需求 + 中文描述：watermark ↔ 水印 反向也能对上", () => {
  const restore = withItem("skill:shuiyin", "批量加水印、去水印，保持画质");
  try {
    const w = m.wordAudit("please remove the watermark");
    assert.ok(w.matched.some((x) => x.term === "watermark" && x.item === "skill:shuiyin"), `实际：${JSON.stringify(w.matched)}`);
  } finally {
    restore();
  }
});

test("V3 别名表是双向的，且不会自己套自己", () => {
  assert.ok(m.aliasesFor("水印").includes("watermark"));
  assert.ok(m.aliasesFor("watermark").includes("水印"));
  assert.ok(m.aliasesFor("dark mode").includes("深色模式"));
  assert.deepEqual(m.aliasesFor("完全无关的词"), []);
});

test("V4 每个非 infra 条目都带 scan 文本（中英对照已拼进去）", () => {
  const items = m.catalogTexts();
  assert.ok(items.length > 0);
  for (const it of items) assert.ok(typeof it.scan === "string" && it.scan.includes(it.text), `${it.id} 缺 scan`);
});

test("V5 capabilityScan 也走别名：中文需求能命中英文描述", () => {
  const restore = withItem("skill:watermark-remover", "Remove watermark from photos");
  try {
    const hits = m.capabilityScan("把水印去掉");
    assert.ok(hits.some((x) => x.id === "skill:watermark-remover"), `实际：${hits.map((x) => x.id).join(",")}`);
  } finally {
    restore();
  }
});

test("V6 没提到的词一次最多问 3 个，其余进 pending", () => {
  const words = { unmatched: ["a词", "b词", "c词", "d词", "e词"] };
  assert.equal(m.unknownWordAsks(words, 3).length, 3);
  const w = m.wordAudit("帮我做甲词乙词丙词丁词");
  assert.equal(w.pending, Math.max(0, w.unmatched.length - 3));
});

test("V7 没问到的词不会消失：面板仍列出全部未覆盖词", () => {
  const need = "帮我做唢呐、竖琴、皮影、木雕、泥塑";
  const a = m.analyzeNeed(need, store);
  const w = a.audit.words;
  assert.ok(w.unmatched.length >= 5, `实际 ${w.unmatched.length}`);
  assert.ok(w.pending >= 1);
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, m.dynamicScenario(need, a, null), store, null);
  for (const term of w.unmatched) assert.ok(text.includes(term), `面板漏了 ${term}`);
  assert.match(text, /另有 \d+ 个没提到的词本轮不问/);
});

test("V8 全量核对与逐词核对用同一份条目快照（总数一致）", () => {
  const a = m.analyzeNeed("把水印去掉并出个报告", store);
  assert.equal(a.audit.total, m.catalogTexts().length);
  assert.equal(a.audit.words.accounted, a.audit.words.total);
});

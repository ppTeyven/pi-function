// 完整性：需求里的每个词都必须有归属，accounted 必须等于 total。
// 这条是“绝对重视每个字”的可执行形式——丢词会让它立刻变红。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

const CORPUS = [
  "帮我把这份报告加上水印并转成二维码",
  "就针对这两个问题做20个测试",
  "我要做下面的ppt和pdf",
  "做个极简风格的海报，配色要干净",
  "画一张能扫码的图，再剪个视频",
  "把 webpack 迁到 vite",
  "做成 1920x1080 的封面，写一句 slogan",
  "随便看看",
];

test("C1 每个词都有归属：accounted === total", () => {
  for (const need of CORPUS) {
    const w = m.wordAudit(need);
    assert.equal(w.accounted, w.total, `${need}：${w.accounted}/${w.total} ${JSON.stringify(w.counts)}`);
  }
});

test("C2 六个桶求和 === total", () => {
  for (const need of CORPUS) {
    const w = m.wordAudit(need);
    const sum = Object.values(w.counts).reduce((a, b) => a + b, 0);
    assert.equal(sum, w.total, `${need}：${JSON.stringify(w.counts)}`);
  }
});

test("C3 单字有归属，不是被丢掉", () => {
  const w = m.wordAudit("画一张图");
  assert.ok(w.counts.single >= 1, `single=${w.counts.single}`);
  assert.equal(w.accounted, w.total);
});

test("C4 单字动作也能被识别（画 / 剪 / 译）", () => {
  assert.equal(m.deedWords("画一张封面").find((d) => d.term === "画")?.role, "design");
  assert.equal(m.deedWords("剪个短片").find((d) => d.term === "剪")?.role, "video");
  assert.equal(m.deedWords("译成英文").find((d) => d.term === "译")?.role, "i18n");
});

test("C5 通用词有记录，不是被过滤掉", () => {
  const w = m.wordAudit("帮我生成内容并优化一下");
  assert.ok(w.counts.filler + w.counts.generic > 0, JSON.stringify(w.counts));
  assert.equal(w.accounted, w.total);
});

test("C6 没提到的词全部保留，pending 只影响“问几个”不影响记录", () => {
  const w = m.wordAudit("做成 1920x1080 的封面，写一句 slogan");
  assert.ok(w.unmatched.length > 2, `unmatched=${w.unmatched.length}`);
  assert.equal(w.pending, w.unmatched.length - 3);
  assert.equal(w.accounted, w.total);
});

test("C7 数字 / 英文 / 全角标点混排也不丢词", () => {
  const w = m.wordAudit("把 v2.16.0 的 CHANGELOG 更新一下，再发个 release；顺便 @一下我");
  assert.equal(w.accounted, w.total, `${JSON.stringify(w.counts)}`);
});

test("C8 面板写清“全部有归属”和每个桶的数量", () => {
  const need = "帮我把这份报告加上水印";
  const a = m.analyzeNeed(need, store);
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, m.dynamicScenario(need, a, null), store, null);
  assert.match(text, /全部有归属/);
  assert.match(text, /虚词 \d+ 个/);
  assert.match(text, /单字 \d+ 个/);
  const w = a.audit.words;
  assert.equal(w.accounted, w.total);
});

test("C9 空需求与纯标点不炸，且 total 为 0", () => {
  for (const need of ["", "   ", "。。。"]) {
    const w = m.wordAudit(need);
    assert.equal(w.total, 0);
    assert.equal(w.accounted, 0);
  }
});

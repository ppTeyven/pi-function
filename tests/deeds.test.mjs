// 动词与形容词也是需求：「润色」要写作能力，「极简」要设计能力，不许被当成噪声。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));

const deeds = (need) => m.deedWords(need);

test("D1 动词被认出来，并映射到能力角色", () => {
  const d = deeds("帮我润色并精简这段话");
  const byTerm = Object.fromEntries(d.map((x) => [x.term, x]));
  assert.equal(byTerm["润色"]?.role, "writing");
  assert.equal(byTerm["精简"]?.role, "writing");
  assert.equal(byTerm["润色"]?.kind, "action");
});

test("D2 形容词被认出来，映射到风格/设计", () => {
  const d = deeds("做个极简风格的海报，配色要干净");
  const terms = d.map((x) => x.term);
  for (const w of ["极简", "干净", "配色"]) assert.ok(terms.includes(w), `缺少 ${w}：${terms.join(",")}`);
  assert.equal(d.find((x) => x.term === "极简")?.kind, "style");
});

test("D3 词性不串台：动作是 action，风格是 style", () => {
  const d = deeds("极简地改写这段文案");
  assert.equal(d.find((x) => x.term === "极简")?.kind, "style");
  assert.equal(d.find((x) => x.term === "改写")?.kind, "action");
});

test("D4 动作/风格进入 tags，进而影响选择", () => {
  assert.ok(m.tagsOf("帮我润色一下").includes("writing"));
  assert.ok(m.tagsOf("要极简风格").includes("design"));
  const a = m.analyzeNeed("做个极简风格的海报", store);
  const picked = [...a.skills.map((s) => s.skill), ...a.packages.map((p) => p.pkg)];
  assert.ok(picked.includes("design-system"), `实际：${picked.join(",")}`);
});

test("D5 说得出但没人能干的动作 → 缺口 source=deed", () => {
  const gaps = m.deedGaps("把访谈录音剪辑成短片");
  const cut = gaps.find((g) => g.id === "deed:剪辑");
  assert.ok(cut, `实际：${gaps.map((g) => g.id).join(",")}`);
  assert.equal(cut.source, "deed");
  assert.match(cut.label, /动作/);
  assert.match(cut.hint, /能力/);
});

test("D6 已经有角色能干的动作不产生缺口", () => {
  assert.deepEqual(m.deedGaps("帮我润色这段话"), []);
});

test("D7 虚词不是动作词", () => {
  assert.deepEqual(deeds("把这份加上一下这个"), []);
});

test("D8 面板会把动作/风格列出来，并标出是否已覆盖", () => {
  const need = "做个极简风格的海报";
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, m.dynamicScenario(need, m.analyzeNeed(need, store), null), store, null);
  assert.match(text, /动作\/风格：/);
  assert.match(text, /极简→/);
  assert.match(text, /（已覆盖）/);
});

test("D9 analyzeNeed 的逐词结果里带 deeds", () => {
  const a = m.analyzeNeed("把这份数据去重并可视化", store);
  const terms = a.audit.words.deeds.map((d) => d.term);
  assert.ok(terms.includes("去重"), `实际：${terms.join(",")}`);
  assert.ok(terms.includes("可视化"), `实际：${terms.join(",")}`);
});

// /function scan 重建组合时的归类：与需求侧同一套词典（别名 + 名词/动词/形容词）。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
const FIXTURE = JSON.parse(JSON.stringify(store));

const build = (extra = {}) => {
  const s = JSON.parse(JSON.stringify(FIXTURE));
  s.known = { ...s.known, ...extra };
  const prof = m.buildProfile(s);
  m.hydrateCatalog(prof);
  return prof;
};

const item = (id, description) => ({
  [`skill:${id}`]: { kind: "skill", label: id, description, tools: [], commands: [], skills: [], scenario: null, auto: true, missing: false },
});

test("S1 expandItemText 给英文描述补上中文写法", () => {
  const t = m.expandItemText("Remove watermark from photos");
  assert.match(t, /水印/);
  assert.match(t, /照片/);
});

test("S2 tagRoleHits 把动词 / 形容词归到角色", () => {
  const hits = m.tagRoleHits("润色、精简、校对");
  assert.deepEqual(hits.writing?.sort(), ["校对", "精简", "润色"].sort());
  assert.equal(m.tagRoleHits("极简、干净")?.design?.length, 2);
});

test("S3 全英文描述也能在 scan 时归进角色（别名 + 词表）", () => {
  const prof = build(item("watermark-remover", "Remove watermark from photos and PDFs, batch mode"));
  const info = prof.itemInfo["watermark-remover"];
  assert.deepEqual(info?.roles, ["vision"], `实际：${JSON.stringify(info?.roles)}`);
  assert.ok(!prof.unassigned.includes("skill:watermark-remover"));
});

test("S4 只有动词 / 形容词描述的条目也能归类", () => {
  const prof = build(item("tighten-copy", "把长文精简、校对，语感更自然"));
  const info = prof.itemInfo["tighten-copy"];
  assert.ok(info?.roles?.includes("writing"), `实际：${JSON.stringify(info?.roles)}`);
});

test("S5 单个词表命中不改变成员资格（避免误归类）", () => {
  const prof = build(item("vibes", "整体风格偏商务"));
  const info = prof.itemInfo["vibes"];
  assert.ok(!info || info.roles.length === 0, `单个词不该定性：${JSON.stringify(info?.roles)}`);
});

test("S6 scan 重建后每个条目都有角色或明确进未归类", () => {
  const prof = m.buildProfile(store);
  const ids = Object.keys(prof.itemInfo);
  for (const id of ids) {
    const roles = prof.itemInfo[id].roles || [];
    const listed = prof.unassigned.includes(id) || prof.unassigned.includes(`skill:${id}`) || prof.unassigned.includes(`npm:${id}`);
    assert.ok(roles.length > 0 || listed, `${id} 既没角色也没进未归类`);
  }
});

test("S7 归类是确定性的（两次 buildProfile 结果一致）", () => {
  const a = m.buildProfile(store).itemInfo;
  const b = m.buildProfile(store).itemInfo;
  for (const id of Object.keys(a)) assert.deepEqual(a[id].roles, b[id].roles, id);
});

test("S8 /function scan 会报告未归类情况", async () => {
  const state = { run: null, notices: [], messages: [], active: ["read"] };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") state.run = cmd.handler || cmd; },
    on() {},
    appendEntry() {},
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
      confirm: async () => false,
      input: async () => null,
      select: async () => null,
      setEditorText: () => {},
    },
  };
  await state.run("scan", ctx);
  const text = state.notices.join("\n");
  assert.match(text, /全部 \d+ 个条目都归入了能力角色|未归类 \d+\/\d+ 个/, `实际：${text}`);
});

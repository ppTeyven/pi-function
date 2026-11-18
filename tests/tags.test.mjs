// 阶段 B/C 测试：能力标签 + 名额集合覆盖
// 依据 testcase-generator 的"判定表"：角色证据 > 标签证据；覆盖不到就不给名额。
// 跑法：node --experimental-strip-types --test tests/tags.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
const profile = m.buildProfile(store);
m.hydrateCatalog(profile);
const byId = new Map(m.SCENARIOS.map((s) => [s.id, s]));

test("B1 tagsOf：中文能力词映射到能力角色", () => {
  assert.deepEqual(m.tagsOf("Excel 表格透视与图表"), ["data"]);
  assert.deepEqual(m.tagsOf("红头文件排版"), ["docx"]);
  assert.deepEqual(m.tagsOf("定时爬虫抓取"), ["automation"]);
  assert.deepEqual(m.tagsOf("完全无关的一句话"), []);
});

test("B2 profile：每个条目都带 tags；非 infra 角色必须体现在 tags 里", () => {
  for (const [id, info] of Object.entries(profile.itemInfo)) {
    assert.ok(Array.isArray(info.tags), `${id} 缺 tags`);
    for (const role of info.roles || []) {
      if (m.CAPABILITIES[role]?.infra) {
        // 基础设施角色只打标记，不进能力标签
        assert.equal(info.infra, true, `${id} 的 infra 标记丢了`);
        continue;
      }
      assert.ok(info.tags.includes(role), `${id} 的 tags 缺角色 ${role}`);
    }
  }
});

test("C1 覆盖选择：角色证据优先于标签证据", () => {
  // openwiki 的分类角色是 docs/repo-wiki，"code-intel" 只是描述里出现"代码"；
  // pi-lens 的角色就是 code-intel —— 必须选 pi-lens。
  const cands = [
    { id: "openwiki", score: 10, roles: ["docs"], tags: ["code-intel", "docs"] },
    { id: "pi-lens", score: 2, roles: ["code-intel"], tags: ["code-intel"] },
  ];
  const picked = m.selectByCoverage(cands, 5, ["code-intel"]).map((x) => x.id);
  assert.deepEqual(picked, ["pi-lens"]);
});

test("C2 覆盖选择：需求覆盖完就停，不按分数硬塞", () => {
  const cands = [
    { id: "a", score: 100, roles: ["docs"], tags: ["docs"] },
    { id: "b", score: 90, roles: ["docs"], tags: ["docs"] },
  ];
  const picked = m.selectByCoverage(cands, 5, ["docs"]).map((x) => x.id);
  assert.equal(picked.length, 1, "只该选一个够用的");
});

test("C3 覆盖选择：多个需求时逐个覆盖，受名额上限约束", () => {
  const cands = [
    { id: "x", score: 5, roles: ["data"], tags: ["data"] },
    { id: "y", score: 9, roles: ["slides"], tags: ["slides"] },
    { id: "z", score: 1, roles: ["docs"], tags: ["docs"] },
  ];
  const picked = m.selectByCoverage(cands, 2, ["data", "slides", "docs"]).map((x) => x.id);
  assert.equal(picked.length, 2);
  assert.ok(picked.includes("x") && picked.includes("y"), `实际 ${picked}`);
});

test("C4 覆盖选择：确定性（同一输入两次结果一致）", () => {
  const cands = [
    { id: "b", score: 5, roles: ["data"], tags: [] },
    { id: "a", score: 5, roles: ["data"], tags: [] },
  ];
  const one = JSON.stringify(m.selectByCoverage(cands, 3, ["data"]).map((x) => x.id));
  const two = JSON.stringify(m.selectByCoverage(cands, 3, ["data"]).map((x) => x.id));
  assert.equal(one, two);
});

test("C5 覆盖选择：空候选或零名额返回空", () => {
  assert.deepEqual(m.selectByCoverage([], 5, ["data"]), []);
  assert.deepEqual(m.selectByCoverage([{ id: "x", score: 1, roles: ["data"], tags: [] }], 0, ["data"]), []);
});

test("C6 analyzeNeed：弱证据下也要覆盖首要场景必需角色（plugin → code-intel）", () => {
  const a = m.analyzeNeed("plugin", store);
  const picked = [...a.packages.map((x) => String(x.pkg).replace(/^npm:/, "")), ...a.skills.map((x) => x.skill)];
  const members = (profile.roles?.["code-intel"]?.packages || []).map((x) => x.id.replace(/^npm:/, ""));
  assert.ok(members.some((id) => picked.includes(id)), `code-intel 未被覆盖：${picked}`);
});

test("C7 analyzeNeed：需求覆盖后不再堆插件（PPT 需求不给联网搜索）", () => {
  const a = m.analyzeNeed("做个 12 页的产品汇报 PPT", store);
  const pkgs = a.packages.map((x) => x.pkg);
  assert.ok(!pkgs.some((p) => /web-access|multi-search/.test(p)), `不该带搜索类：${pkgs}`);
  assert.ok(a.packages.length <= 2, `插件过多：${pkgs}`);
});

test("C8 analyzeNeed：输出仍受预算约束", () => {
  for (const need of ["做个 PPT", "写个爬虫", "把流程做成 SOP", "分析表格数据"]) {
    const a = m.analyzeNeed(need, store);
    assert.ok(a.packages.length <= m.LIMITS.packages);
    assert.ok(a.skills.length <= m.LIMITS.skills);
  }
});

test("C9 覆盖选择结果与 tags 一致：被选中的都至少覆盖一个需求", () => {
  const a = m.analyzeNeed("把审片流程标准化成 SOP", store);
  const picked = [...a.packages.map((x) => String(x.pkg).replace(/^npm:/, "")), ...a.skills.map((x) => x.skill)];
  for (const id of picked) {
    const info = profile.itemInfo[id];
    if (!info) continue;
    assert.ok((info.tags || []).length > 0, `${id} 无标签却被选中`);
  }
});

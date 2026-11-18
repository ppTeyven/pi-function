// 能力缺口测试：需求提到但本机没有的能力 → 报缺口 → 由用户决定是否 find-skill。
// 跑法：node --experimental-strip-types --test tests/gaps.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
const baseProfile = m.buildProfile(store);
m.hydrateCatalog(baseProfile);

const dyn = (need) => m.dynamicScenario(need, m.analyzeNeed(need, store), null);
const gapIds = (need) => m.capabilityGaps(dyn(need), store, null).map((g) => g.id);

test("G1 需求里的 pdf 报缺口，已装的 ppt 不报", () => {
  assert.deepEqual(gapIds("我要做下面的ppt和pdf"), ["pdf"]);
  assert.deepEqual(gapIds("帮我做个ppt"), []);
});

test("G2 反方向条目不算覆盖：PDF→Markdown 的转换器仍报 pdf 缺口", () => {
  const fake = {
    ...baseProfile,
    itemInfo: {
      ...baseProfile.itemInfo,
      "skill:markdown-converter": { kind: "skill", description: "Convert PDF, Word (.docx) and PPTX files to Markdown", tags: ["docs"], roles: ["docs"] },
    },
  };
  m.hydrateCatalog(fake);
  try {
    assert.ok(gapIds("把内容导出成pdf").includes("pdf"), "PDF→Markdown 不该被当成能生成 PDF");
  } finally {
    m.hydrateCatalog(baseProfile);
  }
});

test("G3 装了真能生成 PDF 的技能就不报缺口", () => {
  const fake = {
    ...baseProfile,
    itemInfo: {
      ...baseProfile.itemInfo,
      "skill:pdf-export": { kind: "skill", description: "生成 PDF 并导出，支持中文字体与分页", tags: ["docs"], roles: ["docs"] },
    },
  };
  m.hydrateCatalog(fake);
  try {
    assert.deepEqual(gapIds("把内容导出成pdf"), []);
  } finally {
    m.hydrateCatalog(baseProfile);
  }
});

test("G4 契约里必需但没装的能力也算缺口（source=contract）", () => {
  const fake = {
    ...baseProfile,
    roles: { ...baseProfile.roles, docx: { id: "docx", label: "公文 / 正式排版", packages: [], skills: [], infra: false } },
  };
  m.hydrateCatalog(fake);
  try {
    const scenario = { id: "docx", title: "公文 / 正式发文", when: "公文、红头文件、讲话稿" };
    const gaps = m.capabilityGaps(scenario, store, null);
    const docx = gaps.find((g) => g.id === "docx");
    assert.ok(docx, "docx 必需能力没装，应该报缺口");
    assert.equal(docx.source, "contract");
  } finally {
    m.hydrateCatalog(baseProfile);
  }
});

test("G5 缺口去重，且最多报 3 个", () => {
  const ids = gapIds("pdf pdf 表格 视频剪辑 配音 ocr 图片转文字");
  assert.equal(new Set(ids).size, ids.length, "缺口有重复");
  assert.ok(ids.length <= 3, `缺口应截断到 3 个，实际 ${ids.length}`);
  assert.ok(ids.includes("pdf"));
});

test("G6 findSkillCommandName 优先取用户装的 skill-finder", () => {
  const cmds = [
    { name: "ppt-master", source: "skill" },
    { name: "skill:find-skill-skillhub", source: "skill" },
    { name: "skill:skill-finder", source: "skill" },
    { name: "function", source: "extension" },
  ];
  assert.equal(m.findSkillCommandName(cmds), "skill:skill-finder");
  assert.equal(m.findSkillCommandName([{ name: "skill:find-skill-skillhub", source: "skill" }]), "skill:find-skill-skillhub");
  assert.equal(m.findSkillCommandName([{ name: "function", source: "extension" }]), null);
});

test("G7 find-skill 的请求必须写清：先确认本机、给候选、等确认再装", () => {
  const gaps = m.capabilityGaps(dyn("做ppt和pdf"), store, null);
  const msg = m.skillSearchMessage(gaps, "做ppt和pdf");
  assert.match(msg, /缺的能力：PDF 生成/);
  assert.match(msg, /先确认本机/);
  assert.match(msg, /2-3 个候选/);
  assert.match(msg, /等我确认再装/);
  assert.match(msg, /不要假装能做到/);
});

test("G8 没有能力词的需求不报缺口", () => {
  assert.deepEqual(gapIds("把这段话改写得更正式"), []);
});

test("G9 装配面板会列出能力缺口，并说明会问用户", () => {
  const scenario = dyn("我要做下面的ppt和pdf");
  const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [] }, scenario, store, null);
  assert.match(text, /能力缺口（本机没有）/);
  assert.match(text, /PDF 生成 \/ 转换/);
  assert.match(text, /要不要用 find-skill 去找/);
});

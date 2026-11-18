// /function 分配系统回归测试
// 计划与门禁见同目录 TEST-PLAN.md（依据 qa 技能的分层验证 + testcase-generator 的设计方法）
// 跑法：node --experimental-strip-types --test function-menu-tests/allocation.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";

import { EXT, STORE } from "./_bootstrap.mjs";
const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));
const strip = (id) => String(id).replace(/^npm:/, "").replace(/^skill:/, "");
const fakePi = { getAllTools: () => [], getCommands: () => [], getAllSkills: () => [] };

// 金标准：每个场景一条真实需求（等价类：单场景命中）
const GOLDEN = {
  article: "帮我写一篇公众号文章，讲插件精简",
  report: "做一份行业调研报告，带数据对比和出处",
  presentation: "做个 12 页的产品汇报 PPT",
  docs: "写一份使用手册文档，以后给新人看",
  webpage: "做一个产品落地页网页，要好看",
  webapp: "开发一个后台管理系统的 Web 应用",
  mobile: "做一个微信小程序",
  game: "做一个网页小游戏",
  design: "设计一套品牌视觉和配色",
  data: "分析这份销售数据，出图表",
  api: "写一个 REST API 后端服务",
  automation: "写个定时爬虫，每天抓价格",
  integration: "接入外部系统的 MCP 服务",
  plugin: "给 Pi 写一个插件，加个工具",
  process: "把审片流程标准化成 SOP",
  maintain: "这个老项目要重构，顺便修 bug",
  localization: "把界面翻译成英文，做本地化",
  social: "写一条小红书种草文案",
  novel: "写一部悬疑小说的开头",
  video: "写一个短视频分镜脚本",
  image: "做一张海报封面图",
  course: "设计一门 8 节课的培训课程",
  resume: "帮我优化简历，投后端岗位",
  event: "策划一个周末露营活动",
  commerce: "优化商品详情页，提升转化",
  dashboard: "做一个 BI 数据仪表盘",
  tool: "写一个命令行小工具",
  chatbot: "做一个客服 AI 机器人",
  email: "写一封客户营销邮件",
  music: "写一首歌的歌词",
  spreadsheet: "用 Excel 表格做对账",
  legal: "帮我看看这份合同的隐私政策条款",
};

// 已知缺装：能力角色下一个可用条目都没有。修好后从这里删，测试会立即要求覆盖。
// 缺口已补（装 excel-data-wizard / cron / cd-scraper 后四个场景转绿），机制保留
const KNOWN_GAPS = new Set();

const scenariosById = new Map(m.SCENARIOS.map((s) => [s.id, s]));
const profile = m.buildProfile(store);
const roleMembers = (role) => [
  ...((profile.roles?.[role]?.packages) || []).map((p) => strip(p.id)),
  ...((profile.roles?.[role]?.skills) || []).map((s) => strip(s.id)),
];

// ---------------------------------------------------------------- L1 单元

test("G2 契约完备：每个场景都有 required/optional/forbidden 三个字段", () => {
  const broken = [];
  for (const s of m.SCENARIOS) {
    const c = m.SCENARIO_CONTRACTS[s.id];
    if (!c || !Array.isArray(c.required) || !Array.isArray(c.optional) || !Array.isArray(c.forbidden)) {
      broken.push(s.id);
    }
  }
  assert.deepEqual(broken, [], "缺契约或字段不全");
});

test("L1 判定表：auditCoverage 的 ok / not-selected / not-installed 三态映射", () => {
  // 已装且已入选 → ok
  const okCase = m.auditCoverage(scenariosById.get("localization"), store, null);
  assert.deepEqual(okCase.missing, [], "已装场景不应报缺");

  // 已装但组合里没有成员 → not-selected（动态场景给空选择）
  const emptyPick = { id: "custom", title: "空组合", dynamic: true, plugins: [], skillIds: [], when: "x", brief: "", keywords: [], noAlways: true };
  const notSelected = m.auditCoverage(
    { ...scenariosById.get("process"), ...emptyPick, id: "process" },
    store,
    null,
  );
  assert.ok(notSelected.missing.every((x) => x.kind === "not-selected"), "有可用条目时应报 not-selected");

  // 没装 → not-installed：逐个场景检查"必需角色一个成员都没有"的情况都必须被报出。
  // 不绑定具体场景（环境装齐后 data 已不是空角色，硬编码会假失败）。
  const emptyRoleCases = [];
  for (const sc of m.SCENARIOS) {
    const cov = m.auditCoverage(sc, store, null);
    for (const need of cov.required) {
      const hasMember = roleMembers(need).length > 0;
      if (!hasMember) emptyRoleCases.push({ id: sc.id, need, kinds: cov.missing.map((x) => x.kind) });
    }
  }
  for (const c of emptyRoleCases) {
    assert.ok(c.kinds.includes("not-installed"), `${c.id} 的空角色 ${c.need} 未被报成 not-installed`);
  }
});

test("L1 contractFor：组合场景取 required 并集、forbidden 交集", () => {
  const combo = m.comboScenarios([scenariosById.get("image"), scenariosById.get("design")]);
  const c = m.contractFor(combo);
  assert.deepEqual(c.required, ["design"], "并集去重");
  assert.deepEqual(c.forbidden, ["code-intel"], "两边都禁止才算禁止");
});

test("L1 边界：通用场景不再被普通措辞命中（score 0）", () => {
  for (const text of ["你好，今天状态怎么样", "帮我看看这个方案行不行", "怎么优化比较好"]) {
    const hit = m.scoreScenarios(text).find((r) => r.scenario.id === "general");
    assert.ok(!hit, `"${text}" 不应命中 general`);
  }
});

// ---------------------------------------------------------------- L2 集成

test("G4 金标准意图识别：33 条需求各自命中自己的场景", () => {
  const wrong = [];
  for (const [expected, need] of Object.entries(GOLDEN)) {
    const top = m.scoreScenarios(need)[0];
    if (!top || top.scenario.id !== expected) {
      wrong.push(`${expected} ← "${need}" 实际=${top ? top.scenario.id : "无"}`);
    }
  }
  assert.deepEqual(wrong, [], "意图识别跑偏");
});

test("G1 required 覆盖率 100%（缺装场景除外）+ G2 forbidden 命中 0", () => {
  const gaps = [];
  const forbidden = [];
  for (const s of m.SCENARIOS) {
    const cov = m.auditCoverage(s, store, null);
    if (cov.missing.length && !KNOWN_GAPS.has(s.id)) gaps.push(`${s.id}: ${cov.missing.map((x) => x.need).join(",")}`);
    if (cov.forbiddenHit.length) forbidden.push(`${s.id}: ${cov.forbiddenHit.join(",")}`);
  }
  assert.deepEqual(gaps, [], "漏用");
  assert.deepEqual(forbidden, [], "无关能力混入");
});

test("已知缺装场景只能报 not-installed，不能静默", () => {
  for (const id of KNOWN_GAPS) {
    const cov = m.auditCoverage(scenariosById.get(id), store, null);
    assert.ok(cov.missing.length > 0, `${id} 应报出缺装`);
    assert.ok(cov.missing.every((x) => x.kind === "not-installed"), `${id} 只应是缺装`);
  }
});

test("G3 动态组合 precision ≥ 0.80 且覆盖首要场景 required", () => {
  const rows = [];
  for (const [, need] of Object.entries(GOLDEN)) {
    const analysis = m.analyzeNeed(need, store);
    const top = analysis.intents[0];
    if (!top) continue;
    const scenario = scenariosById.get(top.scenario.id);
    const contract = m.contractFor(scenario);
    const relevant = new Set([...contract.required, ...contract.optional].flatMap(roleMembers));
    const picked = [...analysis.packages.map((x) => strip(x.pkg)), ...analysis.skills.map((x) => strip(x.skill))];
    if (!picked.length) continue;
    const precision = picked.filter((id) => relevant.has(id)).length / picked.length;
    const recall = contract.required.length
      ? contract.required.filter((role) => roleMembers(role).some((id) => picked.includes(id))).length / contract.required.length
      : 1;
    rows.push({ id: scenario.id, precision, recall, picked });
  }
  const avg = rows.reduce((n, r) => n + r.precision, 0) / rows.length;
  const lowRecall = rows.filter((r) => r.recall < 1 && !KNOWN_GAPS.has(r.id));
  assert.ok(avg >= 0.8, `平均 precision ${avg.toFixed(3)} < 0.80`);
  assert.deepEqual(lowRecall.map((r) => `${r.id}:${r.recall.toFixed(2)}`), [], "动态组合漏掉 required");
});

// ---------------------------------------------------------------- L3 不变量

test("G5 预算：packages ≤ 5、skills ≤ 5（对全部金标准需求）", () => {
  const over = [];
  for (const need of Object.values(GOLDEN)) {
    const a = m.analyzeNeed(need, store);
    if (a.packages.length > m.DYNAMIC_LIMITS.packages || a.skills.length > m.DYNAMIC_LIMITS.skills) {
      over.push(`${need}: ${a.packages.length}/${a.skills.length}`);
    }
  }
  assert.deepEqual(over, [], "超出预算");
});

test("G6 确定性：同输入两次分析结果完全一致", () => {
  for (const need of Object.values(GOLDEN)) {
    const a = JSON.stringify(m.analyzeNeed(need, store));
    const b = JSON.stringify(m.analyzeNeed(need, store));
    assert.equal(a, b, `非确定性：${need}`);
  }
});

test("G7 只读路径不写盘：调用前后 store 字节不变", () => {
  const before = crypto.createHash("sha256").update(fs.readFileSync(STORE)).digest("hex");
  for (const need of Object.values(GOLDEN)) {
    const analysis = m.analyzeNeed(need, store);
    const scenario = m.dynamicScenario(need, analysis, null);
    m.buildProposal(fakePi, scenario, store, null);
    m.auditCoverage(scenario, store, null);
  }
  m.buildCatalog(fakePi, store);
  m.buildProfileReport(store);
  const after = crypto.createHash("sha256").update(fs.readFileSync(STORE)).digest("hex");
  assert.equal(after, before, "只读路径写入了 store（R3 事故回归）");
});

// ---------------------------------------------------------------- L5 端到端

function makeHarness() {
  const tools = [
    { name: "read", sourceInfo: { path: "builtin:read" } },
    { name: "todo", sourceInfo: { path: "/x/node_modules/@juicesharp/rpiv-todo/dist/index.js" } },
    { name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/dist/index.js" } },
  ];
  const state = { active: tools.map((t) => t.name), run: null, notices: [], entries: [] };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") state.run = cmd.handler || cmd; },
    on() {}, appendEntry(t, d) { state.entries.push({ t, d }); }, sendMessage() {},
    getAllTools: () => tools,
    getActiveTools: () => state.active,
    setActiveTools: (n) => { state.active = n; },
    getCommands: () => [], getAllSkills: () => [],
  };
  m.default(pi);
  const ctx = (selects = [], confirms = []) => ({
    hasUI: true,
    ui: {
      notify: (t) => state.notices.push(String(t)),
      select: async () => selects.shift() ?? null,
      confirm: async () => confirms.shift() ?? false,
      input: async () => null,
      setEditorText: () => {},
    },
  });
  return { state, ctx };
}

test("L5 场景法 · 备选流：未知 id 直接拒绝且不改状态", async () => {
  const { state, ctx } = makeHarness();
  const before = [...state.active];
  await state.run("debug+nope", ctx());
  assert.ok(state.notices.some((n) => n.includes("未知 id")), "应提示未知 id");
  assert.deepEqual(state.active, before, "失败路径不得改工具集");
  assert.equal(state.entries.length, 0, "失败路径不得写会话记录");
});

test("L5 场景法 · 主流程 + 取消：组合装配 / 取消不落盘", async () => {
  const { state, ctx } = makeHarness();
  await state.run("debug+process", ctx([], [false])); // 取消
  assert.equal(state.entries.length, 0, "取消不应写记录");
  await state.run("debug+process", ctx([], [true])); // 确认
  assert.equal(state.entries.length, 1, "确认后应写一条记录");
  assert.match(state.entries[0].d.id, /debug\+process/);
});

test("L5 场景法 · 菜单多选上限 3，超出不再追问", async () => {
  const { state, ctx } = makeHarness();
  const selects = ["debug · 排查修复", "review-gate · 评审 / 迭代守门", "parallel · 并行探索", "process · 流程"];
  const confirms = [true, true, true, true, false];
  await state.run("assemble", ctx(selects, confirms));
  const picked = state.notices.find((n) => n.includes("已装配"));
  assert.ok(picked, "应完成装配");
  assert.ok(!/parallel.*\+.*process/.test(picked), "不得叠加第 4 个");
});

// ---------------------------------------------------------------- G8 性能

test("G8 analyzeNeed 平均耗时 < 20ms（182 条目录）", () => {
  const needs = Object.values(GOLDEN);
  const start = process.hrtime.bigint();
  const rounds = 3;
  for (let i = 0; i < rounds; i += 1) for (const need of needs) m.analyzeNeed(need, store);
  const ms = Number(process.hrtime.bigint() - start) / 1e6 / (rounds * needs.length);
  assert.ok(ms < 20, `平均 ${ms.toFixed(2)}ms 超过 20ms`);
});

// ================================================================ 扩测（L1 纯函数）
// 用 qa 技能的“区分强制项与置信项”原则：只断言约定，不断言实现细节。

test("L1 general 场景：required 必须为空且带 fallback 标记", () => {
  const general = scenariosById.get("general");
  assert.ok(general?.fallback, "general 必须是兜底场景");
  assert.deepEqual(m.SCENARIO_CONTRACTS.general.required, [], "兜底场景不应有硬要求");
});

test("L1 contractFor 单场景：原样返回该场景契约", () => {
  const one = m.contractFor(scenariosById.get("process"));
  assert.deepEqual(one, m.SCENARIO_CONTRACTS.process);
});

test("L1 auditCoverage 能检出 forbidden 混入", () => {
  // 人为把一个 code-intel 成员塞进 image 组合
  const roleCodeIntel = roleMembers("code-intel");
  if (!roleCodeIntel.length) return; // 未装则跳过
  const sc = { ...scenariosById.get("image"), plugins: [roleCodeIntel[0]], skillIds: [] };
  const cov = m.auditCoverage(sc, store, null);
  assert.ok(cov.forbiddenHit.includes("code-intel"), "应报出 forbidden 命中");
});

test("L1 termScoreDistinct：通用词不计分，termScore 会计分（对照）", () => {
  const terms = ["插件", "工具", "工作流"];
  assert.equal(m.termScoreDistinct(terms, "读写插件与工具的工作流").score, 0);
  assert.ok(m.termScore(terms, "读写插件与工具的工作流").score > 0, "对照组应计分");
});

test("L1 termScoreDistinct：最长匹配——被更长命中包含的碎片不重复计分", () => {
  const terms = ["当用", "当用户", "知识库"];
  const r = m.termScoreDistinct(terms, "当用户提到知识库时");
  assert.ok(!r.hits.includes("当用"), "碎片不应计入");
  assert.ok(r.hits.includes("当用户"), "长匹配应保留");
});

test("L1 needTerms：保留英文 token，过滤汉语停用词", () => {
  const terms = m.needTerms("用 playwright 测试 这个页面");
  assert.ok(terms.includes("playwright"), "英文 token 必须保留");
  assert.ok(!terms.includes("这个"), "停用词必须过滤");
});

test("L1 GENERIC_TERMS 不得吞掉领域词（ppt/pdf/word/excel）", () => {
  for (const w of ["ppt", "pdf", "word", "excel"]) {
    assert.ok(!m.GENERIC_TERMS.has(w), `${w} 不应被视为通用词`);
  }
});

test("L1 comboScenarios：单元素返回原对象，多元素合并去重", () => {
  const a = scenariosById.get("process");
  assert.equal(m.comboScenarios([a]), a);
  const merged = m.comboScenarios([a, scenariosById.get("plugin")]);
  assert.equal(new Set(merged.plugins).size, merged.plugins.length, "plugins 必须去重");
  assert.deepEqual(merged.comboIds, ["process", "plugin"]);
});

test("L1 comboWorkflows：steps 去重、checkpoint 用「；」连接", () => {
  const merged = m.comboWorkflows([m.workflowById("debug"), m.workflowById("review-gate")]);
  assert.equal(new Set(merged.steps).size, merged.steps.length, "steps 必须去重");
  assert.ok(merged.checkpoint.includes("；"), "检查点应合并");
  assert.ok(merged.doneWhen.length > 0);
});

test("L1 comboSkillIds：组合场景取两个场景技能并集", () => {
  const combo = m.comboScenarios([scenariosById.get("data"), scenariosById.get("docs")]);
  const ids = m.comboSkillIds(combo, store, null);
  const a = m.scenarioSkillIds(store, "data");
  const b = m.scenarioSkillIds(store, "docs");
  for (const id of [...a, ...b]) assert.ok(ids.includes(id), `并集缺 ${id}`);
});

test("L1 followupQuestions：流程类 4 问，普通场景 3 问", () => {
  const wf = m.workflowById("process-design");
  assert.equal(m.followupQuestions(scenariosById.get("process"), wf).length, 4);
  assert.equal(m.followupQuestions(scenariosById.get("article"), null).length, 3);
});

test("L1 dynamicScenario：字段契约完整", () => {
  const need = "把审片流程标准化成 SOP";
  const dyn = m.dynamicScenario(need, m.analyzeNeed(need, store), null);
  for (const key of ["id", "title", "when", "plugins", "skillIds", "dynamic", "analysis"]) {
    assert.ok(key in dyn, `缺字段 ${key}`);
  }
  assert.equal(dyn.dynamic, true);
  assert.equal(dyn.when, need);
});

// ================================================================ 扩测（L2 金标准分组）
const goldenEntries = Object.entries(GOLDEN);
const chunk = Math.ceil(goldenEntries.length / 4);
for (let i = 0; i < 4; i += 1) {
  const part = goldenEntries.slice(i * chunk, (i + 1) * chunk);
  test(`L2 金标准分组 ${i + 1}/4：${part.length} 条需求命中自身场景`, () => {
    const wrong = [];
    for (const [expected, need] of part) {
      const top = m.scoreScenarios(need)[0];
      if (!top || top.scenario.id !== expected) wrong.push(`${expected}←${top?.scenario.id ?? "无"}`);
    }
    assert.deepEqual(wrong, []);
  });
}

test("L2 同义改写：排版/公文措辞要能带出公文技能", () => {
  for (const need of ["把这份讲话稿排成公文格式", "这个通知做成红头文件"]) {
    const a = m.analyzeNeed(need, store);
    const names = a.skills.map((x) => x.skill);
    assert.ok(names.includes("gongwenformat-pro"), `"${need}" 没带出公文技能：${names.join(",")}`);
  }
});

test("L2 英文需求也能命中场景", () => {
  const top = m.scoreScenarios("write a blog post about plugin bloat")[0];
  assert.ok(top && ["article", "social", "general"].includes(top.scenario.id), `英文需求落到 ${top?.scenario.id}`);
});

test("L2 空输入/纯标点：不得命中任何场景", () => {
  for (const text of ["", "   ", "。。。", "？？！"]) {
    assert.deepEqual(m.scoreScenarios(text), [], `"${text}" 不应命中`);
  }
});

test("L2 超长需求（约 2000 字）不抛异常且守住预算", () => {
  const need = "插件装配后工具数量不正确，需要排查。".repeat(60);
  const a = m.analyzeNeed(need, store);
  assert.ok(a.packages.length <= m.LIMITS.packages);
  assert.ok(a.skills.length <= m.LIMITS.skills);
});

// ================================================================ 扩测（L3 不变量）
test("L3 输出无重复条目", () => {
  for (const need of Object.values(GOLDEN)) {
    const a = m.analyzeNeed(need, store);
    const pkgs = a.packages.map((x) => x.pkg);
    const skills = a.skills.map((x) => x.skill);
    assert.equal(new Set(pkgs).size, pkgs.length, `重复插件：${need}`);
    assert.equal(new Set(skills).size, skills.length, `重复技能：${need}`);
  }
});

test("L3 隐私需求不引入联网能力", () => {
  const a = m.analyzeNeed("这些内容保密，不能外发，帮我整理成文档", store);
  const networked = a.packages.filter((x) => profile.itemInfo?.[x.pkg]?.network).map((x) => x.pkg);
  assert.deepEqual(networked, [], "隐私需求带入了联网插件");
});

test("L3 非 MCP 需求不引入 MCP 角色插件", () => {
  const a = m.analyzeNeed("写一份产品说明文档", store);
  const mcpPkgs = a.packages.filter((x) => (profile.itemInfo?.[x.pkg]?.roles || []).includes("mcp")).map((x) => x.pkg);
  assert.deepEqual(mcpPkgs, [], "普通需求带入了 MCP 插件");
});

test("L3 兜底场景不产生插件（避免把通用能力整套拉起）", () => {
  const a = m.analyzeNeed("给个通用任务的建议", store);
  assert.ok(a.packages.length <= 1, `兜底场景给了 ${a.packages.length} 个插件`);
});

test("L3 fuzz：随机拼接 20 条需求不抛异常", () => {
  const words = ["插件", "流程", "报表", "海报", "接口", "测试", "翻译", "简历", "爬虫", "对账", "PPT", "3D"];
  for (let i = 0; i < 20; i += 1) {
    const need = Array.from({ length: 4 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join("，");
    assert.doesNotThrow(() => m.analyzeNeed(need, store), `fuzz 失败：${need}`);
  }
});

test("L3 analyzeNeed 返回字段完备", () => {
  const a = m.analyzeNeed("做个 BI 仪表盘", store);
  for (const key of ["need", "terms", "intents", "packages", "skills", "confidence", "private", "useMcp"]) {
    assert.ok(key in a, `缺字段 ${key}`);
  }
  assert.ok(["high", "medium", "low"].includes(a.confidence));
});

// ================================================================ 扩测（L4 持久化）
test("L4 store 一致性：无 missing 标记，分类版本最新", () => {
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
  const missing = Object.entries(raw.known || {}).filter(([, v]) => v?.missing).map(([k]) => k);
  assert.deepEqual(missing, [], "存在被标成 missing 的条目（R3 事故回归）");
  assert.equal(raw.classifierVersion, m.CLASSIFIER_VERSION);
});

test("L4 源码不得再回退成扫描时标 missing", () => {
  const src = fs.readFileSync(new URL("../function-menu.js", import.meta.url), "utf8");
  assert.ok(!src.includes("meta.missing = true"), "reconcile 不应在扫描时标 missing");
});

test("L4 scan 守卫：枚举不完整时不得丢条目、不得标 missing", async () => {
  const { state, ctx } = makeHarness(); // 初始化会写一次 profile，先让它写完
  const before = JSON.parse(fs.readFileSync(STORE, "utf8")).known;
  await state.run("scan", ctx());
  const after = JSON.parse(fs.readFileSync(STORE, "utf8")).known;
  const lost = Object.keys(before).filter((id) => !(id in after));
  const marked = Object.entries(after).filter(([, v]) => v?.missing).map(([id]) => id);
  assert.deepEqual(lost, [], "扫描把已知条目弄丢了（R3 事故回归）");
  assert.deepEqual(marked, [], "扫描把条目标成了 missing");
});


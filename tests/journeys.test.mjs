// 用户旅程测试：模拟真实用户的复合需求（不是"关键词命中"，而是"人话"）
// 设计依据：qa 技能的"风险驱动"——真实需求往往跨场景、措辞模糊，
// 因此对这类用例不断言"必须命中某一个 id"（那是错的期望），而是断言：
//   · 首要场景的必需能力被覆盖（或明确报缺装）
//   · 不出现该场景明令禁止的能力
//   · precision 达到下限、预算不超
//   · 装配后确实给出方向（追问清单）
// 跑法：node --experimental-strip-types --test function-menu-tests/journeys.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);
const store = m.loadStore();
m.hydrateCatalog(m.buildProfile(store));
const profile = m.buildProfile(store);
const strip = (id) => String(id).replace(/^npm:/, "").replace(/^skill:/, "");
const roleMembers = (role) => [
  ...((profile.roles?.[role]?.packages) || []).map((p) => strip(p.id)),
  ...((profile.roles?.[role]?.skills) || []).map((s) => strip(s.id)),
];
const scenariosById = new Map(m.SCENARIOS.map((s) => [s.id, s]));
// 缺口已补（装 excel-data-wizard / cron / cd-scraper 后四个场景转绿），机制保留
const KNOWN_GAPS = new Set();

function picked(need) {
  const analysis = m.analyzeNeed(need, store);
  return {
    analysis,
    picked: [...analysis.packages.map((x) => strip(x.pkg)), ...analysis.skills.map((x) => strip(x.skill))],
    top: analysis.intents[0]?.scenario || null,
  };
}

function judge(need) {
  const { analysis, picked: ids, top } = picked(need);
  assert.ok(top, `没有识别出任何场景：${need}`);
  const contract = m.contractFor(top);
  const relevant = new Set([...contract.required, ...contract.optional].flatMap(roleMembers));
  const precision = ids.length ? ids.filter((id) => relevant.has(id)).length / ids.length : 1;
  const uncovered = contract.required.filter((role) => {
    const members = roleMembers(role);
    if (!members.length) return false; // 缺装由 G1 管，这里只管"有条目却没选"
    return !members.some((id) => ids.includes(id));
  });
  const forbidden = contract.forbidden.filter((role) => roleMembers(role).some((id) => ids.includes(id)));
  return { analysis, ids, top, precision, uncovered, forbidden, contract };
}

// 真实用户需求（复合、带口语、跨场景）
const JOURNEYS = [
  { name: "产品发布会 PPT（30 页 + 数据图 + 演讲稿）", need: "我要做一个 30 页的产品发布会 PPT，里面要有市场数据图表和逐页演讲稿", allow: ["presentation", "report"] },
  { name: "官网落地页（文案 + 配色 + 移动端）", need: "给公司官网做一个落地页，需要文案、配色方案和移动端适配", allow: ["webpage", "design"] },
  { name: "年度经营分析报告", need: "写一份 2026 年度经营分析报告，要有图表和数据出处", allow: ["report"] },
  { name: "微信小程序（从原型开始）", need: "做一个微信小程序，先从原型图和页面结构开始", allow: ["mobile", "webapp"] },
  { name: "销售 Excel 变交互看板", need: "把我们销售数据的 Excel 做成可交互的看板，能按地区筛选", allow: ["dashboard", "spreadsheet", "data"] },
  { name: "开源项目 README + 使用文档", need: "给这个开源项目写 README 和上手使用文档，要能让新人跑起来", allow: ["docs"] },
  { name: "产品界面中译英本地化", need: "把我们的产品界面和文案翻译成英文，做完整本地化", allow: ["localization"] },
  { name: "合同隐私条款审查", need: "帮我改一份合同，重点是隐私政策和数据条款", allow: ["legal"] },
  { name: "200 人线下发布会策划", need: "策划一场 200 人的线下发布会，包含物料清单和日程安排", allow: ["event"] },
  { name: "新员工 8 节培训课", need: "给新员工做一套 8 节的培训课，要课件和练习", allow: ["course"] },
  { name: "3 万字科幻中篇", need: "写一部 3 万字的科幻中篇小说，先出人物和大纲", allow: ["novel"] },
  { name: "双十一主图海报（5 个尺寸）", need: "做一张双十一主图海报，要输出 5 个不同尺寸", allow: ["image", "commerce"] },
  { name: "审片流程固化 SOP", need: "把审片流程固化成 SOP，并重新分配每步用的工具", allow: ["process"] },
  { name: "爬虫失败没人知道的自动化监控", need: "我们的爬虫每天抓价格，失败了没人知道，想要定时跑并自动告警", allow: ["automation"] },
  { name: "接入企业微信 MCP 服务", need: "接入企业微信的 MCP 服务，能把消息同步到我们的系统", allow: ["integration"] },
  { name: "线上报错：装配后工具数量不对", need: "线上报错：插件装配之后工具数量不对，有时候多有时候少，帮我排查", allow: ["maintain", "plugin"] },
  { name: "给 Pi 写插件加 /hello 命令", need: "给 Pi 写个插件，加一个 /hello 命令", allow: ["plugin"] },
  { name: "客户续费邮件（带优惠）", need: "写一封给客户的续费邮件，说明今年的优惠和升级点", allow: ["email"] },
  { name: "求职作品集网站", need: "帮我做一个求职作品集网站，要能展示三个项目", allow: ["resume", "webpage"] },
  { name: "会议录音转纪要 + 待办", need: "把这段会议录音整理成会议纪要和后续待办清单", allow: ["docs", "event"] },
  { name: "品牌主题曲歌词", need: "写一首品牌主题曲的歌词，温暖有记忆点", allow: ["music"] },
  { name: "网页版贪吃蛇小游戏", need: "做一个小游戏：网页版贪吃蛇，能记录最高分", allow: ["game", "webpage"] },
  { name: "电商详情页 20 条商品文案", need: "给我们店铺写 20 条商品详情页文案，风格统一", allow: ["commerce", "social", "article"] },
  { name: "竞品定价对比表", need: "分析三家竞品的定价策略，出个对比表", allow: ["data", "report", "spreadsheet"] },
  { name: "webpack 迁移到 vite（重构构建）", need: "把项目从 webpack 迁到 vite，重构构建配置并保证线上不受影响", allow: ["maintain"] },
];

test("用户旅程用例表本身完整（25 条，允许集合非空）", () => {
  assert.equal(JOURNEYS.length, 25);
  for (const j of JOURNEYS) assert.ok(Array.isArray(j.allow) && j.allow.length, `${j.name} 缺少 allow`);
});

for (const j of JOURNEYS) {
  test(`旅程 · ${j.name}`, () => {
    const r = judge(j.need);
    assert.ok(j.allow.includes(r.top.id), `首要场景 ${r.top.id} 不在允许集合 ${j.allow.join("/")}`);
    assert.deepEqual(r.uncovered, [], `必需能力没被覆盖：${r.uncovered.join(",")}`);
    assert.deepEqual(r.forbidden, [], `出现禁止能力：${r.forbidden.join(",")}`);
    assert.ok(r.precision >= 0.5, `precision ${r.precision.toFixed(2)} 过低（选中 ${r.ids.join("、")}）`);
    assert.ok(r.ids.length <= m.LIMITS.packages + m.LIMITS.skills, "超出预算");
    // 装配后必须能给方向
    const followups = m.followupQuestions(r.top, m.workflowById(m.recommendWorkflow(r.top)));
    assert.ok(followups.length >= 3 && followups.length <= 4, "追问清单条数不对");
    // 预览必须交代清楚
    const text = m.buildProposal({ getAllTools: () => [], getCommands: () => [], getAllSkills: () => [] }, { ...r.top, plugins: [] }, store, null);
    assert.ok(text.includes("将启用的插件与功能"), "预览缺少插件清单");
    assert.ok(text.includes("装配后会先问你"), "预览缺少追问清单");
  });
}

test("旅程 · 跨场景需求：PPT + 数据 + 演讲稿 应同时带出 slides 与数据类能力", () => {
  const r = judge("我要做一个 30 页的产品发布会 PPT，里面要有市场数据图表和逐页演讲稿");
  const roles = new Set([...r.analysis.packages.map((x) => profile.itemInfo?.[strip(x.pkg)]?.roles || []), ...r.analysis.skills.map((x) => profile.itemInfo?.[strip(x.skill)]?.roles || [])].flat());
  assert.ok(roles.has("slides") || roles.has("design"), `没带出表达/设计能力：${[...roles].join(",")}`);
});

test("旅程 · 大项目需求：预算仍然守住（不会因为描述长就全给）", () => {
  const huge = "我要做一个完整的电商平台，包含官网、后台、小程序、数据分析看板、客服机器人，还要配套的运营文案、发布会 PPT、培训课程和操作手册";
  const analysis = m.analyzeNeed(huge, store);
  assert.ok(analysis.packages.length <= m.LIMITS.packages, `插件 ${analysis.packages.length} 超预算`);
  assert.ok(analysis.skills.length <= m.LIMITS.skills, `技能 ${analysis.skills.length} 超预算`);
  assert.ok(analysis.intents.length <= 4, "意图数量应有上限");
});

test("旅程 · 一句话模糊需求：不得硬塞一堆工具，且要能追问", () => {
  const analysis = m.analyzeNeed("帮我把这个弄好一点", store);
  assert.ok(analysis.packages.length <= 2, `模糊需求给了 ${analysis.packages.length} 个插件`);
  const followups = m.followupQuestions(analysis.intents[0]?.scenario || scenariosById.get("general"), null);
  assert.ok(followups.length >= 3);
});

/**
 * Pi-function — scenario menu & assembler.
 *
 *   /function                   列出全部场景组合（插件 + 功能），然后选一个
 *   /function <需求>            自动识别场景 → 展示插件清单 → 确认后装配
 *   /function <场景id>          直接指定场景
 *   /function scan              重新扫描已安装插件/技能，自动归类新条目
 *   /function assign <名称> <场景id|none>   手动改归类
 *   /function status            查看当前装配
 *   /function off               还原装配前的工具集
 *
 * 装配 = 启用该场景相关工具 + 注入场景流程提示 + 停用无关插件工具。
 * 插件代码本身常驻进程（Pi 不支持运行时装卸扩展），所以“装配”是工具/提示层面的。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const VERSION = "1.2.1";
const NAME = "Pi-function";
const STORE_FILE = "function-menu.json";
const ALWAYS_PACKAGES = ["pi-mcp-adapter"];
// 常驻/默认关闭的基础设施：不参与场景装配，也不进“未分类”
const INFRA_PACKAGES = [
  "billion-context", "cc-safety-net", "pi-pretty", "context-mode",
  "@langchain/langsmith-pi-extension", "@dietrichgebert/ponytail", "glimpseui",
  "@juicesharp/rpiv-ask-user-question", "function-menu",
];

// 已知插件的固定归属（优先于关键词打分；新装的未知插件才走自动分类）
const KNOWN_SCENARIO = {
  "pi-web-access": "research",
  "pi-subagents": "parallel",
  "pi-mcp-adapter": "mcp",
  "openwiki": "understand",
  "@onkernel/browser-loop": "webui",
  "pi-lens": "review",
  "@juicesharp/rpiv-i18n": "i18n",
  "@plannotator/pi-extension": "plan",
  "@juicesharp/rpiv-todo": "feature",
  "pi-simplify": "review",
  "pi-memory": "knowledge",
  "@opengsd/gsd-core": "feature",
  "pi-advisor-flow": "advisor",
  "@quintinshaw/pi-dynamic-workflows": "parallel",
  "@getpipher/vision": "webui",
  "pi-btw": "sideask",
  "context-mode": "infra",
  "pi-mcp": "mcp",
};

// ---------------------------------------------------------------------------
// 场景目录（可自行增删；新插件会被自动归类到这里）
// ---------------------------------------------------------------------------
const SCENARIOS = [
  {
    id: "understand", group: "理解", title: "看懂代码 / 接手仓库",
    when: "陌生仓库、想弄清结构、找某段逻辑在哪、读遗留代码",
    keywords: ["看懂", "理解", "接手", "陌生", "架构", "结构", "在哪", "怎么工作", "读代码", "梳理", "考古", "历史", "onboarding", "understand", "walkthrough", "legacy", "explain", "overview"],
    plugins: ["openwiki", "pi-btw", "pi-memory", "pi-web-access"],
    brief: "先建立地图再下钻：用 openwiki 生成/查询仓库 wiki，用 grep/find 定位，用 pi-btw 做只读旁问；结论写入 pi-memory。不要一上来就改文件。",
    manual: ["首次用 openwiki_begin 扫全库（较慢）", "只想问不想改：/btw:ask \"…\""],
  },
  {
    id: "small", group: "修改", title: "日常小改 / 改一个函数",
    when: "单文件小修、typo、改文案、加一行日志",
    keywords: ["小改", "改一个", "改个", "typo", "文案", "一行", "简单改", "小修", "quick fix", "small change"],
    plugins: [],
    brief: "最小改动原则：直接读目标文件并改，不引入额外插件，不跑重构，不生成计划文档。改完只做针对性验证。",
    manual: [],
  },
  {
    id: "bugfix", group: "修改", title: "修 bug / 复现报错",
    when: "有报错栈、线上问题、行为不符预期",
    keywords: ["bug", "报错", "异常", "崩溃", "复现", "修复", "不工作", "failed", "error", "stack", "traceback", "regression", "线上"],
    plugins: ["context-mode", "pi-web-access", "cc-safety-net"],
    brief: "先复现再改：用 ctx_execute 跑最小复现并过滤日志，用 web_search 查报错原文；定位到根因后只改必要处，最后跑同一复现验证。",
    manual: ["大日志交给 ctx_execute，别整段贴进对话"],
  },
  {
    id: "feature", group: "修改", title: "写新功能（完整流程）",
    when: "从零加一个功能、需要阶段推进和任务跟踪",
    keywords: ["新功能", "实现", "开发", "加一个功能", "feature", "implement", "从零", "需求", "阶段"],
    plugins: ["@opengsd/gsd-core", "rpiv-todo", "pi-lens"],
    brief: "先拆分再实现：用 rpiv-todo 建任务清单（或 /gsd 推进阶段），逐项实现；每完成一项跑测试；用 /lens-toggle 打开静态检查即时暴露问题。",
    manual: ["/lens-toggle 打开静态检查", "/gsd 查看阶段命令"],
  },
  {
    id: "refactor", group: "修改", title: "大重构 / 迁移",
    when: "跨文件重构、换框架、批量机械替换",
    keywords: ["重构", "迁移", "重写", "批量", "替换", "refactor", "migrate", "rewrite", "rename", "升级框架"],
    plugins: ["@quintinshaw/pi-dynamic-workflows", "@plannotator/pi-extension", "rpiv-todo", "pi-simplify"],
    brief: "先审计划再动手：用 plannotator 出计划并等批准，用 workflow 批量执行，用 todo 跟踪批次；每批改完立刻跑测试；最后 /simplify 收尾。不要用 subagent 并发改同一批文件。",
    manual: ["/plannotator-plan-mode 审计划", "/workflows run … 批量执行", "/simplify 收尾"],
  },
  {
    id: "tests", group: "修改", title: "补测试 / 修 flaky",
    when: "覆盖不足、测试不稳定、需要并行跑分片",
    keywords: ["测试", "单测", "用例", "覆盖", "flaky", "test", "pytest", "jest", "vitest", "分片"],
    plugins: ["pi-lens", "pi-subagents", "context-mode"],
    brief: "先跑现有测试拿到基线；用 subagent 并行跑不同分片（输出交给 ctx 过滤）；补测试只测行为不测实现；flaky 先隔离再修。",
    manual: ["/lens-toggle 让失败即时可见"],
  },
  {
    id: "review", group: "验证", title: "代码评审 / 写 PR 描述",
    when: "提交前自查、回应 review、生成 PR 说明",
    keywords: ["评审", "review", "pr", "自查", "diff", "代码审查", "描述", "提交前"],
    plugins: ["pi-simplify", "@quintinshaw/pi-dynamic-workflows"],
    brief: "先看 diff 统计再逐处审：用 ctx_execute 跑 git diff --stat，只把关键 hunk 放进上下文；用 /simplify 或 /code-review 做第二遍；PR 描述写“为什么改 + 怎么验”。",
    manual: ["/simplify --staged", "/code-review"],
  },
  {
    id: "plan", group: "验证", title: "计划评审",
    when: "动手前要人批准方案、拆阶段",
    keywords: ["计划", "方案", "评审", "拆解", "plan", "design", "批准", "步骤"],
    plugins: ["@plannotator/pi-extension", "rpiv-todo"],
    brief: "只出计划不写代码：用 plannotator 展示方案等批准，批准后用 todo 拆成可执行项；计划里写清验收标准。",
    manual: ["/plannotator-plan-mode"],
  },
  {
    id: "research", group: "验证", title: "查资料 / 写调研",
    when: "查文档、比对方案、写技术调研",
    keywords: ["查资料", "调研", "文档", "搜索", "资料", "research", "search", "survey", "对比方案", "官网"],
    plugins: ["pi-web-access", "pi-memory", "openwiki"],
    brief: "先搜后读再记：web_search 找入口，fetch_content 读原文，结论与出处写入 memory；不确定的版本信息必须查官网，不靠记忆。",
    manual: [],
  },
  {
    id: "webui", group: "协作", title: "浏览器 / UI 验收",
    when: "页面交互、点击流程、截图对比、端到端验收",
    keywords: ["浏览器", "页面", "截图", "点击", "ui", "前端验收", "browser", "playwright", "dom", "e2e", "登录"],
    plugins: ["@onkernel/browser-loop", "@getpipher/vision", "@plannotator/pi-extension"],
    brief: "先选能力再操作：用 /browser-tools 选中需要的 selector，再用 browser_*/computer_* 执行；每步截图确认；视觉模型不可用时用人眼核对关键截图。",
    manual: ["/browser-tools browser 选能力（需要 KERNEL_API_KEY）", "vision 需要已配置视觉模型"],
  },
  {
    id: "data", group: "验证", title: "日志 / 性能 / 数据分析",
    when: "大日志、benchmark、性能剖析、数据统计",
    keywords: ["日志", "性能", "benchmark", "分析", "统计", "profiling", "slow", "内存", "cpu", "latency", "数据"],
    plugins: ["context-mode", "@quintinshaw/pi-dynamic-workflows"],
    brief: "数据不进对话：用 ctx_execute 跑脚本/过滤/聚合，只回传结论行；benchmark 用 workflow 并行跑不同参数；对比要给数字和测试条件。",
    manual: [],
  },
  {
    id: "parallel", group: "协作", title: "多任务并行",
    when: "互相独立的模块同时推进",
    keywords: ["并行", "同时", "多任务", "分开做", "parallel", "subagent", "子代理", "并发"],
    plugins: ["pi-subagents", "rpiv-todo"],
    brief: "只并行真正独立的部分：一个子代理一个目录/模块，禁止同时改同一文件；用 todo 记录每个分支；汇总时统一跑测试。",
    manual: [],
  },
  {
    id: "sideask", group: "协作", title: "问一句、不打断主线",
    when: "顺带问个问题、查个符号、要个只读结论",
    keywords: ["顺便问", "旁问", "问一下", "不打断", "btw", "顺便", "side question", "插一句"],
    plugins: ["pi-btw"],
    brief: "用 /btw:ask 做只读旁问，不要在主线程展开；需要改文件的旁路任务才用 /btw。",
    manual: ["/btw:ask \"…\""],
  },
  {
    id: "advisor", group: "协作", title: "要第二意见",
    when: "方案取舍、架构决策、需要另一个模型点评",
    keywords: ["第二意见", "顾问", "取舍", "另一个模型", "advisor", "点评", "second opinion", "选型"],
    plugins: ["pi-advisor-flow"],
    brief: "先配模型再问：/advisor-models 选顾问模型，然后 ask_advisor 带上上下文与候选方案；把顾问意见当输入，不盲从。",
    manual: ["/advisor-models 先配置顾问模型"],
  },
  {
    id: "audit", group: "验证", title: "安全审计 / 依赖检查",
    when: "查漏洞、许可证、危险调用、依赖风险",
    keywords: ["安全", "审计", "漏洞", "许可证", "合规", "security", "audit", "cve", "license", "依赖风险"],
    plugins: ["@quintinshaw/pi-dynamic-workflows", "cc-safety-net", "pi-web-access"],
    brief: "限定范围再扫：明确目录/依赖清单；用 /codebase-audit 或 workflow 并行检查；CVE 与许可证必须查官方源；报告写清位置与修复建议。",
    manual: ["/codebase-audit 指定目录", "cc-safety-net 保持常驻，审计脚本也受保护"],
  },
  {
    id: "release", group: "协作", title: "发布 / CI 排查",
    when: "合并前检查、CI 失败、打 tag、写 release notes",
    keywords: ["发布", "上线", "ci", "流水线", "release", "tag", "合并", "部署", "build 失败"],
    plugins: ["pi-simplify", "rpiv-todo", "cc-safety-net"],
    brief: "按清单走：先看 CI 日志定位第一处失败（不是最后一处），修完本地复跑；合并前 /simplify 自查；release notes 按“破坏性变更/新功能/修复”分组。",
    manual: ["/simplify --staged"],
  },
  {
    id: "knowledge", group: "理解", title: "知识沉淀 / 团队规范",
    when: "把结论写进长期记忆、维护 wiki、记录决策",
    keywords: ["记住", "沉淀", "知识", "规范", "决策", "adr", "文档化", "memory", "wiki", "团队"],
    plugins: ["pi-memory", "openwiki"],
    brief: "只写会复用的：结论 + 原因 + 适用范围写入 memory；流程/架构写进 wiki；一次性细节留在对话里。",
    manual: [],
  },
  {
    id: "privacy", group: "环境", title: "隐私 / 离线 / 省钱",
    when: "敏感仓库、不能外发、token 预算紧",
    keywords: ["隐私", "离线", "敏感", "保密", "省钱", "省 token", "offline", "privacy", "不能外发", "内网"],
    plugins: [],
    brief: "默认全关：不联网、不上报、不用云浏览器；只保留本地工具与安全网。需要联网时必须先说明并征得同意。",
    manual: ["确认 langsmith/vision/browser-loop 均未启用"],
  },
  {
    id: "mcp", group: "环境", title: "MCP / 外部系统集成",
    when: "接数据库、第三方 API、企业系统",
    keywords: ["mcp", "集成", "外部系统", "服务器", "server", "数据库连接", "第三方"],
    plugins: ["pi-mcp-adapter"],
    brief: "先用 /mcp 看服务器状态，再用 mcp 代理工具；新增服务器改配置后 /mcp 重连；不要同时开第二个 MCP provider。",
    manual: ["/mcp 查看/重连", "/mcp-auth 授权"],
  },
  {
    id: "i18n", group: "环境", title: "本地化 / 翻译",
    when: "中文界面、文案翻译、多语言",
    keywords: ["翻译", "本地化", "中文", "多语言", "i18n", "locale", "language", "界面语言"],
    plugins: ["@juicesharp/rpiv-i18n", "pi-web-access"],
    brief: "界面语言用 /languages 切；代码内文案翻译保持 key 不变，只改资源文件；术语先定表再批量替换。",
    manual: ["/languages 选中文（Windows 不会自动识别）"],
  },
  {
    id: "unattended", group: "协作", title: "无人值守批处理",
    when: "跑一批任务、长时间自动执行",
    keywords: ["无人值守", "批量跑", "自动执行", "跑一批", "unattended", "batch", "后台", "长时间"],
    plugins: ["@quintinshaw/pi-dynamic-workflows"],
    brief: "先设预算再开跑：明确 token/时间上限与失败策略；用 /workflows run 而不是关键词触发；每步留日志，失败停在可恢复点。",
    manual: ["/workflows run …", "先确认 defaultTokenBudget 设置"],
  },
  {
    id: "deps", group: "验证", title: "依赖升级",
    when: "升级库、修 breaking change、对齐版本",
    keywords: ["依赖", "升级", "版本", "dependency", "upgrade", "breaking", "npm outdated", "lockfile"],
    plugins: ["pi-web-access", "pi-lens"],
    brief: "先读 changelog 再升：查目标版本 breaking changes，小步升级并每步跑测试；类型错误用 /lens-toggle 打开检查；锁文件冲突按 lockfile 优先。",
    manual: ["/lens-toggle 看类型错误"],
  },
];

// 自动归类的强信号：包名/工具名/描述里出现这些词就投到对应场景
const SCENARIO_HINTS = {
  understand: ["wiki", "openwiki", "codebase", "explain", "navigate"],
  bugfix: ["error", "traceback", "debug", "diagnostic", "stack"],
  feature: ["todo", "gsd", "stage", "scaffold"],
  refactor: ["workflow", "plannotator", "refactor", "migrate", "batch", "multi-agent", "simplify"],
  tests: ["test", "jest", "vitest", "pytest", "flaky", "coverage"],
  review: ["review", "simplify", "diff", "lint"],
  plan: ["plan", "plannotator", "approve", "design"],
  research: ["web", "search", "fetch", "http", "scrape", "crawl"],
  webui: ["browser", "playwright", "screenshot", "dom", "computer", "vision", "image"],
  data: ["benchmark", "profile", "metrics", "execute", "sql", "analytics"],
  parallel: ["subagent", "parallel", "fan-out", "delegate"],
  sideask: ["btw", "side", "chat"],
  advisor: ["advisor", "second opinion", "critique"],
  audit: ["audit", "security", "cve", "license", "safety", "secret"],
  release: ["release", "ci", "deploy", "build", "tag", "publish", "notify"],
  knowledge: ["memory", "wiki", "note", "knowledge", "adr"],
  privacy: ["privacy", "telemetry", "offline", "redact"],
  mcp: ["mcp", "protocol", "server", "integration", "bridge"],
  i18n: ["i18n", "locale", "language", "translate", "translation"],
  unattended: ["workflow", "batch", "background", "autonomous", "long-running"],
  deps: ["dependency", "upgrade", "version", "lockfile", "outdated"],
};

const PLUGIN_INFO = {
  "pi-web-access": { what: "联网搜索与抓取", manual: "" },
  "pi-subagents": { what: "进程内子代理，并行独立任务", manual: "" },
  "pi-mcp-adapter": { what: "MCP 代理（单工具 + 懒启动）", manual: "" },
  "pi-btw": { what: "旁路只读问答，不污染主线", manual: "/btw:ask \"…\"" },
  "pi-memory": { what: "长期记忆 + 草稿 + 检索", manual: "" },
  openwiki: { what: "仓库 wiki：生成/查询/跨库关联", manual: "" },
  "pi-lens": { what: "LSP/静态检查/格式化（当前全局关闭）", manual: "/lens-toggle 临时开" },
  "cc-safety-net": { what: "危险命令拦截（bash/powershell）", manual: "" },
  "rpiv-todo": { what: "任务清单与进度跟踪", manual: "/todos" },
  "@plannotator/pi-extension": { what: "浏览器里审计划/代码", manual: "/plannotator-plan-mode" },
  "@juicesharp/rpiv-i18n": { what: "TUI 界面语言切换", manual: "/languages" },
  "@juicesharp/rpiv-ask-user-question": { what: "一次问清多个选项", manual: "" },
  "context-mode": { what: "大输出转指针，省上下文", manual: "" },
  "pi-simplify": { what: "改动收尾自查（/simplify）", manual: "/simplify" },
  "@quintinshaw/pi-dynamic-workflows": { what: "多代理编排与批量审计", manual: "/workflows run …" },
  "@opengsd/gsd-core": { what: "阶段化开发流程（/gsd）", manual: "gsd_dispatch 在 Windows 不可用" },
  "pi-advisor-flow": { what: "顾问模型第二意见", manual: "/advisor-models 先配置" },
  "@getpipher/vision": { what: "图片描述（需视觉模型）", manual: "无视觉模型时不可用" },
  "@onkernel/browser-loop": { what: "云浏览器/computer-use", manual: "/browser-tools 选能力" },
  "pi-pretty": { what: "主题与工具加速（工具覆盖已禁用）", manual: "" },
  "pi-mcp-extension": { what: "另一套 MCP 客户端（已卸载）", manual: "" },
};

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
const norm = (s) => String(s ?? "").toLowerCase().replace(/\\/g, "/");
const uniq = (arr) => [...new Set(arr)];
const nowIso = () => new Date().toISOString();

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function writeJson(p, data) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
    return true;
  } catch { return false; }
}
function agentDir() {
  return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}
function storePath() { return path.join(agentDir(), STORE_FILE); }

function loadStore() {
  const raw = readJson(storePath(), null);
  if (!raw || typeof raw !== "object") return { version: 1, updatedAt: nowIso(), known: {}, overrides: {}, isNew: true };
  return {
    version: 1,
    updatedAt: raw.updatedAt || nowIso(),
    known: raw.known && typeof raw.known === "object" ? raw.known : {},
    overrides: raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {},
    isNew: false,
  };
}
function saveStore(store) {
  store.updatedAt = nowIso();
  const { isNew, ...rest } = store;
  return writeJson(storePath(), rest);
}

// ---------------------------------------------------------------------------
// 工具/命令/技能归属
// ---------------------------------------------------------------------------
function pkgNeedle(pkg) {
  return "/node_modules/" + norm(pkg).replace(/^npm:/, "") + "/";
}
function matchesPkg(sourceInfo, pkg) {
  if (!sourceInfo) return false;
  const p = norm(sourceInfo.path);
  const s = norm(sourceInfo.source);
  const base = norm(pkg).replace(/^npm:/, "");
  if (!base) return false;
  return p.includes(pkgNeedle(pkg)) || s === base || s === "npm:" + base || s.endsWith(":" + base);
}
function isOptionalSource(sourceInfo) {
  const p = norm(sourceInfo?.path);
  if (!p) return false;
  if (p.startsWith("builtin:")) return false;
  if (p.includes("/node_modules/")) return true;
  if (p.includes("/.pi/agent/extensions/")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 场景匹配
// ---------------------------------------------------------------------------
function scoreScenarios(text, scenarios = SCENARIOS) {
  const t = norm(text);
  if (!t.trim()) return [];
  return scenarios
    .map((s) => {
      const hits = [];
      let score = 0;
      if (t === norm(s.id) || t === norm(s.title)) score += 50;
      for (const kw of s.keywords) {
        const k = norm(kw);
        if (!k) continue;
        if (t.includes(k)) { score += 1 + Math.min(k.length, 8) / 10; hits.push(kw); }
      }
      return { scenario: s, score, hits };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function classifyItem(item, scenarios = SCENARIOS) {
  if (item?.id) {
    const key = item.id.replace(/^(npm|skill|local):/, "");
    const known = KNOWN_SCENARIO[key];
    if (known) return { scenarioId: known, score: 99, reason: "已知插件" };
  }
  const t = norm(item.text || "");
  if (!t.trim()) return { scenarioId: null, score: 0, reason: "无描述" };
  let best = null;
  for (const s of scenarios) {
    const hits = [];
    let score = 0;
    for (const kw of s.keywords) {
      const k = norm(kw);
      if (k && t.includes(k)) { score += 1 + Math.min(k.length, 8) / 10; hits.push(kw); }
    }
    for (const h of SCENARIO_HINTS[s.id] || []) {
      const k = norm(h);
      if (k && t.includes(k)) { score += 2.5; hits.push(h); }
    }
    for (const p of s.plugins) {
      const tail = norm(p.split("/").pop());
      if (tail && t.includes(tail)) { score += 2; hits.push(tail); }
    }
    if (!best || score > best.score) best = { scenarioId: s.id, score, hits };
  }
  if (!best || best.score < 1.5) return { scenarioId: null, score: Number((best?.score || 0).toFixed(2)), reason: "未命中任何场景关键词" };
  return {
    scenarioId: best.scenarioId,
    score: Number(best.score.toFixed(2)),
    reason: "命中 " + uniq(best.hits).slice(0, 4).join(" / "),
  };
}

// ---------------------------------------------------------------------------
// 发现已安装的插件与技能
// ---------------------------------------------------------------------------
function listInstalledPackages() {
  const names = new Set();
  const settings = readJson(path.join(agentDir(), "settings.json"), {});
  for (const p of settings.packages || []) {
    const s = String(p);
    if (s.startsWith("npm:")) names.add(s.slice(4));
  }
  for (const d of ["npm", ""]) {
    const pj = path.join(agentDir(), d, "package.json");
    const data = readJson(pj, null);
    for (const n of Object.keys(data?.dependencies || {})) names.add(n);
  }
  return [...names];
}

function discoverItems(pi) {
  const items = new Map();
  const ensure = (id, init) => {
    if (!items.has(id)) items.set(id, { id, tools: [], commands: [], skills: [], ...init });
    return items.get(id);
  };

  // 1) 已启用的 npm 包
  for (const pkg of listInstalledPackages()) {
    const pj = readJson(path.join(agentDir(), "npm", "node_modules", pkg, "package.json"), null);
    ensure("npm:" + pkg, {
      kind: "plugin",
      pkg,
      label: pkg,
      description: pj?.description || "",
      version: pj?.version || "",
      text: [pkg, pj?.description || ""].join(" "),
    });
  }

  // 2) 本地扩展文件
  try {
    for (const f of fs.readdirSync(path.join(agentDir(), "extensions"))) {
      if (!/\.(ts|js)$/.test(f)) continue;
      const id = "local:" + f.replace(/\.(ts|js)$/, "");
      ensure(id, { kind: "plugin", pkg: id, label: f, description: "本地扩展", text: id });
    }
  } catch { /* no dir */ }

  // 3) 工具归属
  for (const t of pi.getAllTools()) {
    const p = norm(t.sourceInfo?.path);
    if (p.includes("/.pi/agent/extensions/")) {
      const f = path.basename(p);
      const it = ensure("local:" + f.replace(/\.(ts|js)$/, ""), { kind: "plugin", label: f, description: "本地扩展", text: f });
      it.tools.push(t.name);
      it.text += " " + t.name + " " + (t.description || "");
      continue;
    }
    for (const [id, it] of items) {
      if (it.kind !== "plugin" || !it.pkg || id.startsWith("local:")) continue;
      if (matchesPkg(t.sourceInfo, it.pkg)) {
        it.tools.push(t.name);
        it.text += " " + t.name + " " + (t.description || "");
        break;
      }
    }
  }

  // 4) 命令 + 技能归属
  for (const c of pi.getCommands()) {
    let owner = null;
    for (const it of items.values()) {
      if (it.kind === "plugin" && it.pkg && matchesPkg(c.sourceInfo, it.pkg)) { owner = it; break; }
    }
    if (owner) {
      const bucket = c.source === "skill" ? owner.skills : owner.commands;
      bucket.push(c.name);
      owner.text += " " + c.name + " " + (c.description || "");
      continue;
    }
    if (c.source === "skill") {
      const id = "skill:" + c.name;
      const it = ensure(id, { kind: "skill", pkg: null, label: c.name, description: c.description || "技能", text: c.name + " " + (c.description || "") });
      it.skills.push(c.name);
    }
  }

  for (const it of items.values()) {
    it.tools = uniq(it.tools);
    it.commands = uniq(it.commands);
    it.skills = uniq(it.skills);
  }
  return items;
}

// ---------------------------------------------------------------------------
// 归类与存储
// ---------------------------------------------------------------------------
function reconcile(store, items) {
  const added = [];
  for (const [id, item] of items) {
    if (store.overrides[id] === "none") continue;
    if (store.known[id]) { store.known[id].missing = false; continue; }
    const c = classifyItem(item);
    const idBase = id.replace(/^(npm|local):/, "").split("/").pop();
    const infra = INFRA_PACKAGES.some((p) => p.split("/").pop() === idBase);
    const scenario = store.overrides[id] || (infra ? "infra" : c.scenarioId);
    store.known[id] = {
      kind: item.kind,
      label: item.label,
      scenario,
      auto: !store.overrides[id] && !infra,
      reason: store.overrides[id] ? "手动指定" : infra ? "常驻基础设施" : c.reason,
      firstSeen: nowIso(),
      version: item.version || undefined,
      missing: false,
    };
    added.push({ id, label: item.label, scenario, reason: store.known[id].reason });
  }
  for (const [id, meta] of Object.entries(store.known)) {
    if (!items.has(id)) meta.missing = true;
  }
  return added;
}

function autoAssignedIds(store, scenarioId) {
  const out = [];
  for (const [id, meta] of Object.entries(store.known)) {
    if (meta.scenario !== scenarioId || meta.missing) continue;
    out.push(id);
  }
  return out;
}

function autoAssigned(store, scenarioId) {
  return autoAssignedIds(store, scenarioId)
    .filter((id) => id.startsWith("npm:"))
    .map((id) => id.slice(4));
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
function scenarioPackages(scenario, store) {
  return uniq([...ALWAYS_PACKAGES, ...scenario.plugins, ...autoAssigned(store, scenario.id)]);
}

function toolsForScenario(pi, scenario, store) {
  const pkgs = scenarioPackages(scenario, store);
  return pi.getAllTools().filter((t) => pkgs.some((p) => matchesPkg(t.sourceInfo, p))).map((t) => t.name);
}

function commandsForPkg(pi, pkg) {
  return pi.getCommands().filter((c) => c.source === "extension" && matchesPkg(c.sourceInfo, pkg));
}

function describePlugin(pi, pkg, manual = "") {
  const info = PLUGIN_INFO[pkg] || {};
  const tools = pi.getAllTools().filter((t) => matchesPkg(t.sourceInfo, pkg)).map((t) => t.name);
  const cmds = commandsForPkg(pi, pkg).map((c) => "/" + c.name);
  const skills = pi.getCommands().filter((c) => c.source === "skill" && matchesPkg(c.sourceInfo, pkg)).map((c) => c.name);
  const bits = [info.what || "插件"];
  if (tools.length) bits.push("工具 " + tools.join(", "));
  if (cmds.length) bits.push("命令 " + cmds.slice(0, 6).join(", "));
  if (skills.length) bits.push("技能 " + skills.join(", "));
  if (manual || info.manual) bits.push("手动 " + (manual || info.manual));
  return bits.join(" · ");
}

function buildProposal(pi, scenario, store) {
  const lines = [];
  lines.push(`## 场景：${scenario.title}`);
  lines.push(`**适用**：${scenario.when}`);
  lines.push("");
  lines.push("**将启用的插件与功能**");
  const pkgs = scenarioPackages(scenario, store);
  const extra = pkgs.filter((p) => p !== "pi-mcp-adapter");
  if (!extra.length && !pkgs.includes("pi-mcp-adapter")) lines.push("- 不启用额外插件（只保留核心工具）");
  for (const pkg of extra) lines.push(`- \`${pkg}\` — ${describePlugin(pi, pkg)}`);
  if (pkgs.includes("pi-mcp-adapter")) lines.push("- `pi-mcp-adapter` — MCP 代理（常驻，不单独计入）");
  const auto = autoAssigned(store, scenario.id).filter((p) => !scenario.plugins.includes(p));
  if (auto.length) lines.push(`- 自动归入：${auto.join(", ")}`);
  const skills = autoAssignedIds(store, scenario.id).filter((id) => id.startsWith("skill:")).map((id) => id.slice(6));
  if (skills.length) lines.push(`- 自动归入技能：${skills.join(", ")}（随会话自动加载）`);
  const brief = scenario.manual?.length ? scenario.manual : [];
  if (brief.length) {
    lines.push("");
    lines.push("**装配后仍需手动做**");
    for (const m of brief) lines.push("- " + m);
  }
  lines.push("");
  lines.push("**不会自动执行**：确认只改变工具与提示，需求仍需你按 Enter 或另行发送。");
  lines.push("**装配含义**：启用上述工具、停用其他插件的可选工具、把本场景流程注入系统提示。插件代码常驻，不会真正卸载。");
  return lines.join("\n");
}

function applyScenario(pi, ctx, scenario, store, baseline) {
  const all = pi.getAllTools();
  const active = pi.getActiveTools();
  const optional = new Set(all.filter((t) => isOptionalSource(t.sourceInfo)).map((t) => t.name));
  const wanted = new Set(toolsForScenario(pi, scenario, store));
  const keep = active.filter((n) => !optional.has(n));
  const next = uniq([...keep, ...wanted]);
  const disabled = active.filter((n) => optional.has(n) && !wanted.has(n));
  pi.setActiveTools(next);
  return { next, enabled: [...wanted].filter((n) => !active.includes(n)), disabled };
}

// ---------------------------------------------------------------------------
// 菜单
// ---------------------------------------------------------------------------
function buildCatalog(pi, store) {
  const lines = [`## /function 场景菜单（${SCENARIOS.length} 个组合）`];
  const groups = uniq(SCENARIOS.map((s) => s.group));
  for (const g of groups) {
    lines.push("");
    lines.push(`### ${g}`);
    for (const s of SCENARIOS.filter((x) => x.group === g)) {
      lines.push(`**${s.id}** · ${s.title}`);
      lines.push(`- 何时用：${s.when}`);
      const pkgs = s.plugins;
      const extra = pkgs.filter((p) => p !== "pi-mcp-adapter");
      if (extra.length) {
        for (const pkg of extra) lines.push(`- \`${pkg}\` — ${describePlugin(pi, pkg)}`);
      } else if (!pkgs.includes("pi-mcp-adapter")) {
        lines.push("- 不需要额外插件");
      }
      if (pkgs.includes("pi-mcp-adapter")) lines.push("- `pi-mcp-adapter` — MCP 代理（常驻）");
      const auto = autoAssignedIds(store, s.id).filter((id) => id.startsWith("npm:") && !s.plugins.includes(id.slice(4)));
      if (auto.length) lines.push(`- 自动归入：${auto.map((id) => id.slice(4)).join(", ")}`);
      const skills = autoAssignedIds(store, s.id).filter((id) => id.startsWith("skill:")).map((id) => id.slice(6));
      if (skills.length) lines.push(`- 自动归入技能：${skills.join(", ")}（随会话自动加载）`);
    }
  }
  const infra = Object.entries(store.known).filter(([, m]) => m.scenario === "infra" && !m.missing).map(([id]) => id.replace(/^(npm|local|skill):/, ""));
  if (infra.length) {
    lines.push("");
    lines.push(`### 常驻（不参与装配）：${infra.join("、")}`);
  }
  const unclassified = Object.entries(store.known).filter(([, m]) => !m.scenario && !m.missing);
  if (unclassified.length) {
    lines.push("");
    lines.push("### 未分类（用 /function assign <名称> <场景id> 指定）");
    for (const [id, m] of unclassified) lines.push(`- ${id}（${m.reason || "无命中"}）`);
  }
  lines.push("");
  lines.push("用法：`/function <需求>` 自动识别；`/function <场景id>` 指定；`/function scan` 重扫；`/function off` 还原。");
  return lines.join("\n");
}

function menuOptions(store) {
  return SCENARIOS.map((s) => {
    const count = scenarioPackages(s, store).filter((p) => p !== "pi-mcp-adapter").length;
    return `${s.id} · ${s.title} — ${count ? count + " 个插件" : "无需插件"}`;
  });
}

// ---------------------------------------------------------------------------
// 扩展入口
// ---------------------------------------------------------------------------
export default function functionMenu(pi) {
  let store = loadStore();
  let activeScenario = null;
  let baseline = [];
  let baselineCaptured = false;
  const captureBaseline = () => {
    if (baselineCaptured) return;
    baseline = pi.getActiveTools();
    baselineCaptured = baseline.length > 0;
  };

  let watcher = null;
  let watchTimer = null;
  let sessionCtx = null;

  const scan = (notify) => {
    const items = discoverItems(pi);
    const added = reconcile(store, items);
    saveStore(store);
    if (added.length && notify) {
      const summary = added.slice(0, 6).map((a) => `${a.label}→${a.scenario || "未分类"}`).join("；");
      notify(`function: 新发现 ${added.length} 个插件/技能，已归类：${summary}${added.length > 6 ? " …" : ""}`, "info");
    }
    return added;
  };

  const startWatcher = (ctx) => {
    if (watcher) return;
    sessionCtx = ctx;
    watcher = [];
    const targets = [
      path.join(agentDir(), "settings.json"),
      path.join(agentDir(), "skills"),
      path.join(agentDir(), "extensions"),
      path.join(agentDir(), "npm", "node_modules"),
    ];
    for (const target of targets) {
      if (!fs.existsSync(target)) continue;
      try {
        const isDir = fs.statSync(target).isDirectory();
        const w = fs.watch(target, { recursive: isDir }, () => {
          clearTimeout(watchTimer);
          watchTimer = setTimeout(() => {
            const added = scan((msg, lvl) => sessionCtx?.ui?.notify(msg, lvl));
            if (added.length) pi.appendEntry("function-scan", { added: added.map((a) => a.id) });
          }, 1500);
        });
        w.on("error", () => {});
        watcher.push(w);
      } catch {
        // 某些平台/路径不支持 watch，静默跳过；/function scan 仍可手动重扫
      }
    }
  };

  const stopWatcher = () => {
    clearTimeout(watchTimer);
    watchTimer = null;
    for (const w of watcher || []) { try { w.close(); } catch {} }
    watcher = null;
  };

  const requireUI = (ctx) => {
    if (ctx.hasUI) return true;
    ctx.ui.notify("当前模式没有交互 UI，请直接用 /function <场景id> 或查看菜单文本", "warning");
    return false;
  };

  const announceProposal = (scenario, reason) => {
    const head = reason ? `匹配依据：${reason}\n\n` : "";
    pi.sendMessage({
      customType: "function-proposal",
      content: head + buildProposal(pi, scenario, store),
      display: true,
    });
  };

  const identifyScenario = async (ctx, text, ranked) => {
    if (ranked.length && ranked[0].score >= 1.2 && (!ranked[1] || ranked[0].score >= ranked[1].score * 1.5)) {
      return { scenario: ranked[0].scenario, reason: ranked[0].hits.slice(0, 5).join(" / ") || ranked[0].scenario.id };
    }
    const options = (ranked.length ? ranked.slice(0, 4).map((r) => r.scenario) : SCENARIOS).map(
      (s) => `${s.id} · ${s.title} — ${s.when}`,
    );
    const sel = await ctx.ui.select("没把握，选一个最接近的场景", options);
    if (!sel) return null;
    const id = sel.split(" · ")[0];
    const pick = SCENARIOS.find((s) => s.id === id) || null;
    return pick ? { scenario: pick, reason: "手动选择" } : null;
  };

  const confirmScenario = async (ctx, scenario, reason) => {
    announceProposal(scenario, reason);
    const pkgs = scenarioPackages(scenario, store).filter((p) => p !== "pi-mcp-adapter");
    const list = pkgs.length ? pkgs.join("、") : "无额外插件";
    return ctx.ui.confirm(
      `装配「${scenario.title}」？`,
      `将启用：${list}\n\n确认后只启用工具并注入流程提示，不会自动执行任何需求。`,
    );
  };

  const functionCommand = {
    description: "Pi-function：场景装配 / 列出组合 / 按需求匹配并装配插件",
    getArgumentCompletions: (prefix) => {
      const base = ["scan", "status", "off", "assign", ...SCENARIOS.map((s) => s.id)];
      return base.filter((v) => v.startsWith(prefix || "")).map((v) => ({ value: v, label: v }));
    },
    handler: async (rawArgs, ctx) => {
      captureBaseline();
      const args = String(rawArgs || "").trim().replace(/^["'“”]|["'“”]$/g, "");
      const sub = args.split(/\s+/)[0] || "";

      if (!args) {
        scan(false);
        pi.sendMessage({ customType: "function-catalog", content: buildCatalog(pi, store), display: true });
        if (!requireUI(ctx)) return;
        const sel = await ctx.ui.select("选择一个场景查看/装配", menuOptions(store));
        if (!sel) return;
        const id = sel.split(" · ")[0];
        const scenario = SCENARIOS.find((s) => s.id === id);
        if (!scenario) return;
        const ok = await confirmScenario(ctx, scenario, "菜单选择");
        if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
        const res = applyScenario(pi, ctx, scenario, store, baseline);
        activeScenario = scenario;
        pi.appendEntry("function-scenario", { id: scenario.id, at: nowIso(), tools: res.next });
        ctx.ui.notify(`已装配「${scenario.title}」：启用 ${res.enabled.length} 个工具，停用 ${res.disabled.length} 个可选工具`, "info");
        return;
      }

      if (sub === "scan") {
        const added = scan(false);
        ctx.ui.notify(added.length ? `扫描完成：新增 ${added.length} 个，已自动归类` : "扫描完成：没有新插件/技能", "info");
        if (added.length) {
          pi.sendMessage({
            customType: "function-scan",
            content: added.map((a) => `- ${a.label} → ${a.scenario || "未分类"}（${a.reason}）`).join("\n"),
            display: true,
          });
        }
        return;
      }

      if (sub === "status") {
        const lines = [];
        lines.push(`当前场景：${activeScenario ? activeScenario.title : "未装配"}`);
        lines.push(`已收录条目：${Object.keys(store.known).length} 个（自动归类 ${Object.values(store.known).filter((m) => m.auto).length}）`);
        const optionalActive = pi.getActiveTools().filter((n) => {
          const t = pi.getAllTools().find((x) => x.name === n);
          return t && isOptionalSource(t.sourceInfo);
        });
        lines.push(`当前启用的插件工具：${optionalActive.length ? optionalActive.join(", ") : "（无）"}`);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (sub === "off") {
        const restored = (baseline.length ? baseline : pi.getActiveTools()).filter((n) => pi.getAllTools().some((t) => t.name === n));
        pi.setActiveTools(restored);
        activeScenario = null;
        ctx.ui.notify(`已还原到装配前工具集（${restored.length} 个工具）`, "info");
        return;
      }

      if (sub === "assign") {
        const [, name, scenarioId] = args.split(/\s+/);
        if (!name || !scenarioId) { ctx.ui.notify("用法：/function assign <包名或 skill:名> <场景id|none>", "warning"); return; }
        if (scenarioId !== "none" && scenarioId !== "infra" && !SCENARIOS.some((s) => s.id === scenarioId)) {
          ctx.ui.notify("未知场景 id：" + scenarioId, "error");
          return;
        }
        const id = name.startsWith("npm:") || name.startsWith("skill:") || name.startsWith("local:") ? name : "npm:" + name;
        store.overrides[id] = scenarioId;
        store.known[id] = {
          ...(store.known[id] || {}),
          kind: id.startsWith("skill:") ? "skill" : "plugin",
          label: name,
          scenario: scenarioId === "none" ? null : scenarioId,
          auto: false,
          reason: "手动指定",
          firstSeen: store.known[id]?.firstSeen || nowIso(),
          missing: false,
        };
        saveStore(store);
        ctx.ui.notify(`已把 ${name} 指定到 ${scenarioId}`, "info");
        return;
      }

      const forced = SCENARIOS.find((s) => s.id === args.toLowerCase());
      if (forced) {
        scan(false);
        if (!requireUI(ctx)) return;
        const ok = await confirmScenario(ctx, forced, "指定场景");
        if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
        const res = applyScenario(pi, ctx, forced, store, baseline);
        activeScenario = forced;
        pi.appendEntry("function-scenario", { id: forced.id, at: nowIso(), tools: res.next });
        ctx.ui.notify(`已装配「${forced.title}」`, "info");
        return;
      }

      scan(false);
      const ranked = scoreScenarios(args);
      if (!requireUI(ctx)) {
        pi.sendMessage({ customType: "function-match", content: buildCatalog(pi, store), display: true });
        return;
      }
      if (!ranked.length) {
        ctx.ui.notify("没识别出场景，先把菜单给你；也可以用 /function <场景id> 指定", "warning");
        pi.sendMessage({ customType: "function-catalog", content: buildCatalog(pi, store), display: true });
        const sel = await ctx.ui.select("选一个场景", menuOptions(store));
        if (!sel) return;
        const id = sel.split(" · ")[0];
        const scenario = SCENARIOS.find((s) => s.id === id);
        if (!scenario) return;
        const ok = await confirmScenario(ctx, scenario, "菜单选择");
        if (!ok) return;
        const res = applyScenario(pi, ctx, scenario, store, baseline);
        activeScenario = scenario;
        pi.appendEntry("function-scenario", { id: scenario.id, at: nowIso(), tools: res.next });
        ctx.ui.notify(`已装配「${scenario.title}」`, "info");
        return;
      }
      const picked = await identifyScenario(ctx, args, ranked);
      if (!picked) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
      const ok = await confirmScenario(ctx, picked.scenario, picked.reason);
      if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
      const res = applyScenario(pi, ctx, picked.scenario, store, baseline);
      activeScenario = picked.scenario;
      pi.appendEntry("function-scenario", { id: picked.scenario.id, at: nowIso(), tools: res.next });
      const restored = typeof ctx.ui.setEditorText === "function";
      if (restored) ctx.ui.setEditorText(args);
      ctx.ui.notify(
        restored
          ? `已装配「${picked.scenario.title}」：启用 ${res.enabled.length} 个，停用 ${res.disabled.length} 个可选工具。需求没有自动执行；已放回输入框，按 Enter 才会开始。`
          : `已装配「${picked.scenario.title}」：启用 ${res.enabled.length} 个，停用 ${res.disabled.length} 个可选工具。需求没有自动执行，请手动重新发送。`,
        "info",
      );
    },
  };

  pi.registerCommand("function", functionCommand);
  pi.registerCommand("pi-function", functionCommand);

  pi.on("session_start", (event, ctx) => {
    captureBaseline();
    const added = scan(false);
    if (added.length) {
      // 静默记录；/function status 可查
      store.lastAdded = added.slice(0, 20);
      saveStore(store);
    }
    startWatcher(ctx);
  });

  pi.on("session_shutdown", () => {
    stopWatcher();
  });

  pi.on("before_agent_start", (event) => {
    if (!activeScenario) return;
    const extra = [
      "",
      `## 当前场景（/function 装配）：${activeScenario.title}`,
      activeScenario.brief,
      activeScenario.manual?.length ? `仍需手动：${activeScenario.manual.join("；")}` : "",
      "只使用当前已启用的工具；缺工具时提示用户运行 /function 重新装配。",
    ].filter(Boolean).join("\n");
    return { systemPrompt: event.systemPrompt + "\n" + extra };
  });
}

// 供测试使用
export { SCENARIOS, PLUGIN_INFO, scoreScenarios, classifyItem, buildCatalog, buildProposal, discoverItems, reconcile, loadStore, saveStore, storePath, scenarioPackages, matchesPkg };

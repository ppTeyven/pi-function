/**
 * Pi-function — scenario menu & assembler.
 *
 *   /function                   列出全部场景组合（插件 + 功能），然后选一个
 *   /function <需求>            自动识别场景 → 展示插件清单 → 确认后装配
 *   /function <场景id>          直接指定场景
 *   /function a+b               多选组合：场景与工作流可混搭（如 debug+process）
 *   /function scan              重新扫已装插件/技能，自动归类新条目
 *   /function assign <名称> <场景id|none>   手动改归类
 *   /function status            查看当前装配
 *   /function off               还原装配前的工具集
 *
 * 模型侧入口：suggest_scenario 工具（只读）—— 按同一套关键词表打分，
 * 返回最匹配场景 + 各插件可用性（absent / inactive / warn / ok），不改变任何状态。
 * 想真正装配仍需用户执行 /function <场景id>。
 *
 * 装配 = 启用该场景相关工具 + 注入场景流程提示 + 停用无关插件工具。
 * 插件代码本身常驻进程（Pi 不支持运行时装卸扩展），所以“装配”是工具/提示层面的。
 *
 * 分配方法层：process 场景 / process-design 工作流装配时，先拆基元（workflow-refactor）
 * → 定验收（spec-workflow-guide）→ 固化 SOP（sop-builder / sop-extractor）
 * → 补能力缺口（skill-finder）→ 最后才按基元分配插件与技能。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const VERSION = "2.8.0";
const NAME = "Pi-function";
const STORE_FILE = "function-menu.json";
const CLASSIFIER_VERSION = 5;
const ALWAYS_PACKAGES = [];
// 核心工具永远保留；其他工具由用户本机安装的插件/技能自动匹配。
const CORE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

// 抽象能力。profile 只认这些角色，不认某个用户的插件名。
const CAPABILITIES = {
  "code-intel": { label: "代码理解 / 静态检查", package: /lens|symbol|lsp|ast|code.?intel|navigat/i, tool: /symbol|diagnostic|module_report|project_report|ast_grep|read_symbol|lsp/i, skill: /lens|symbol|ast-grep|lsp|codebase|architect|refactor/i, terms: /代码|符号|类型|静态检查|codebase|symbol|lsp/i },
  "repo-wiki": { label: "仓库 Wiki / 代码地图", package: /wiki/i, tool: /wiki/i, skill: /wiki/i, terms: /wiki|仓库地图|codebase map/i },
  memory: { label: "长期记忆 / 草稿", package: /memory|memo/i, tool: /memory_|scratchpad/i, skill: /memory|handoff|knowledge/i, terms: /记忆|沉淀|长期|备忘/i, deny: /ima|知识库|connector|web|search/i },
  "side-chat": { label: "旁路问答", package: /btw|side.?chat/i, command: /btw|side/i, skill: /btw|side/i, terms: /旁问|side question|不打断/i },
  web: { label: "联网搜索 / 抓取", package: /web|search|fetch|crawl|http/i, tool: /web_|search|fetch/i, skill: /research|web|search/i, terms: /搜索|联网|网页|资料/i, deny: /gongwen|公文|convert|humaniz|design|frontend/i, network: true },
  subagent: { label: "子代理 / 独立复核", package: /subagent|agent/i, tool: /subagent|contact_supervisor|bg_wait/i, skill: /subagent|council/i, terms: /子代理|subagent|独立复核/i },
  orchestration: { label: "多代理编排", package: /workflow|orchestrat|dynamic/i, tool: /workflow/i, skill: /workflow|parallel|fanout/i, terms: /编排|workflow|并行/i },
  process: { label: "流程 / SOP / 需求建模", skill: /^(workflow-refactor|sop-(builder|extractor)|spec-workflow|skill-finder|requirement)/i, terms: /流程|工作流|sop|需求(分析|拆解|探索|梳理)|验收标准|标准化|作业指导|交接|能力缺口/i },
  task: { label: "任务清单 / 进度", package: /todo|task/i, tool: /^todo$|todos/i, skill: /todo|task/i, terms: /清单|任务|进度|todo/i },
  "plan-review": { label: "计划 / 方案审阅", package: /plannotator|plan|approval/i, tool: /plannotator|plan/i, skill: /plan|spec|architect/i, terms: /计划|方案|审阅|批准/i },
  context: { label: "大输出 / 上下文管理", package: /context/i, tool: /ctx_|context/i, skill: /context|ctx/i, terms: /上下文|大输出|日志/i, infra: true },
  browser: { label: "浏览器 / 页面操作", package: /browser|kernel|playwright|computer/i, tool: /browser|computer|playwright/i, skill: /browser|playwright|e2e/i, terms: /浏览器|截图|点击|页面验收/i, network: true, requiresEnv: "KERNEL_API_KEY", envPackage: /kernel/i },
  vision: { label: "图片理解", package: /vision|image|multimodal/i, tool: /describe_image|vision/i, skill: /vision|image/i, terms: /图片|视觉|截图|image/i, network: true },
  simplify: { label: "收尾简化", package: /simplify/i, command: /simplify/i, skill: /simplify/i, terms: /简化|收尾|cleanup/i },
  advisor: { label: "第二意见", package: /advisor/i, tool: /advisor/i, skill: /advisor/i, terms: /顾问|第二意见|选型/i },
  mcp: { label: "MCP / 外部系统", package: /mcp/i, tool: /^mcp$|mcp_/i, skill: /mcp/i, terms: /mcp|外部系统|第三方服务/i },
  i18n: { label: "本地化 / 多语言", package: /i18n|locale|language/i, command: /languages/i, skill: /i18n|locale|translation/i, terms: /翻译|本地化|多语言|i18n/i },
  gsd: { label: "规格驱动 / 阶段流程", package: /gsd|spec.?driven/i, tool: /gsd_/i, skill: /^gsd-/i, terms: /gsd|规格|里程碑|阶段/i },
  safety: { label: "安全 / 危险操作拦截", package: /safety|guard|security/i, tool: /safety/i, terms: /安全|拦截|guard/i, infra: true },
  pretty: { label: "主题 / 终端美化", package: /pretty|theme/i, tool: /pretty/i, terms: /主题|美化|theme/i, infra: true },
  ask: { label: "选项澄清", package: /ask.?user|question/i, tool: /ask_user_question/i, terms: /澄清|选项|question/i },
  design: { label: "视觉 / UI / 品牌", package: /design|frontend|\bui\b|\bcss\b/i, tool: /design|style/i, skill: /design|frontend|\bcss\b|\bui\b|de-slop/i, terms: /设计|视觉|品牌|配色|排版|\bui\b|\bcss\b/i, deny: /gongwen|公文|format|convert|markdown|humaniz|ima|search|research/i },
  writing: { label: "写作 / 编辑 / 文案", package: /writing|content|docs/i, command: /write|article/i, skill: /writing|copy|blog|article|editor|humaniz|handoff|mermaid|docs/i, terms: /写作|文章|文案|编辑|润色/i, deny: /gongwen|公文|convert|markdown|format|slide|ppt|deck|mermaid|glimpse/i },
  slides: { label: "演示 / 幻灯片", package: /slide|deck|presentation|ppt/i, skill: /ppt|slide|deck|presentation/i, terms: /ppt|幻灯片|演示|路演/i, deny: /gongwen|公文|convert|format|mermaid|markdown/i },
  docx: { label: "公文 / 正式排版", skill: /gongwen|docx|redhead/i, terms: /公文|红头|发文字号|版记|主送|国标|正式发文/ },
  docs: { label: "文档 / 教程 / 知识库", package: /docs|wiki/i, tool: /wiki|docs/i, skill: /docs|documentation|readme|handoff|mermaid|connector|ima/i, terms: /文档|教程|手册|wiki|readme/i, deny: /gongwen|公文|convert|format|search|research/i },
  release: { label: "发布 / CI / 版本", package: /release|publish|deploy|\bci\b/i, command: /release|publish/i, skill: /release|publish|commit|branch|\bci\b/i, terms: /发布|上线|版本|\bci\b|部署/i },
  testing: { label: "测试 / 验证", package: /test|qa/i, tool: /test/i, skill: /test|tdd|qa|prove|coverage/i, terms: /测试|用例|验证|覆盖/i, deny: /search|research|multi|stock|ima|gongwen|humaniz/i },
  automation: { label: "自动化 / 爬虫 / 定时", package: /automation|scrape|crawl|schedule|cron/i, tool: /cron|schedule|scrape|crawl/i, skill: /automation|scrape|crawl|cron|schedul|dispatch|pipeline/i, terms: /自动化|爬虫|定时|批处理/i },
  data: { label: "数据 / 图表 / 分析", package: /data|analytics|chart|sql|pandas/i, tool: /sql|query|chart|dataset/i, skill: /\bdata\b|analytics|csv|chart|pandas|notebook/i, terms: /数据|图表|统计|csv|sql|分析/i, deny: /search|research|multi|stock|newsletter/i },
  perf: { label: "性能 / 基准", package: /perf|benchmark|profile/i, tool: /benchmark|profile/i, skill: /perf|benchmark|profile/i, terms: /性能|基准|延迟|profile/i },
};

// 固定应用场景 -> 固定能力角色。ID 与语义对所有用户一致。
const SCENARIO_CAPABILITIES = {
  article: ["writing", "web", "memory"],
  email: ["writing", "task", "memory"],
  social: ["writing", "design", "web", "memory"],
  novel: ["writing", "memory"],
  video: ["writing", "slides", "memory"],
  music: ["writing", "memory"],
  course: ["slides", "writing", "docs", "memory"],
  resume: ["writing", "docs", "design"],
  event: ["writing", "web", "memory", "task"],
  report: ["web", "writing", "data", "docs", "memory"],
  presentation: ["slides", "design", "writing", "web"],
  docs: ["docs", "writing", "repo-wiki", "memory"],
  docx: ["docx", "writing", "docs"],
  legal: ["writing", "docs", "memory"],
  webpage: ["web", "design", "browser", "writing"],
  webapp: ["web", "design", "browser", "code-intel", "task", "plan-review"],
  commerce: ["web", "design", "data", "browser"],
  mobile: ["design", "browser", "code-intel", "task"],
  game: ["design", "browser", "code-intel", "testing"],
  design: ["design", "slides", "browser", "writing"],
  image: ["design", "vision"],
  data: ["data", "context", "web", "docs"],
  spreadsheet: ["data", "automation", "code-intel"],
  dashboard: ["data", "design", "web", "code-intel"],
  api: ["code-intel", "testing", "docs", "plan-review"],
  automation: ["automation", "web", "browser", "code-intel"],
  tool: ["code-intel", "testing", "automation"],
  integration: ["mcp", "web"],
  chatbot: ["web", "mcp", "memory", "code-intel"],
  plugin: ["code-intel", "testing", "docs", "plan-review", "orchestration"],
  process: ["process", "plan-review", "task", "docs"],
  maintain: ["code-intel", "testing", "simplify", "context", "plan-review"],
  localization: ["i18n", "writing", "web"],
  general: ["writing", "web", "docs", "memory", "task"],
};

// 工作流套餐：只绑定“执行过程需要的能力”，不和场景抢领域能力。
// 允许重叠：debug 与 review-gate 都可用代码理解/测试；
// parallel 与 review-gate 都可用子代理；outline 与 phased 都可用计划审阅。
const WORKFLOW_SKILL_PATTERNS = {
  direct: { allow: null },
  outline: { allow: /plan|spec|architect|outline|prd|todo|task|review/i, deny: /convert|connector|gongwen|ppt|slide|web-search|stock|\bima\b/i },
  research: { allow: /search|research|wiki|source|evidence|mermaid|knowledge|note/i, deny: /convert|gongwen|connector|\bima\b/i },
  debug: { allow: /debug|lsp|symbol|ast|codebase|diagnos|test|tdd|prove|trace/i, deny: /multi-search|web-search|research|stock|connector|\bima\b|gongwen|convert/i },
  parallel: { allow: /subagent|council|workflow|delegate|parallel|orchestrat/i },
  "review-gate": { allow: /review|audit|verify|prove|qa|test|lens|lsp|simplify|council|subagent|iterate|refine/i, deny: /multi-search|web-search|research|stock|connector|\bima\b|gongwen|convert|ppt|slide|workflow/i },
  phased: { allow: /gsd|spec|plan|phase|milestone|verify|execute/i, deny: /web-search|stock|connector|gongwen|convert/i },
  "process-design": { allow: /workflow-refactor|sop-|spec-workflow|process|requirement|plan|knowledge|note/i, deny: /convert|gongwen|stock|connector|\bima\b|ppt|slide|web-search|research/i },
  offline: { allow: /memory|handoff|note|knowledge|scratch/i, deny: /connector|\bima\b|web|search|stock/i },
};

const WORKFLOW_CAPABILITIES = {
  direct: [],
  outline: ["plan-review", "task", "memory"],
  research: ["web", "repo-wiki", "memory", "docs"],
  debug: ["code-intel", "testing", "context", "simplify"],
  parallel: ["subagent", "orchestration", "task"],
  "review-gate": ["subagent", "orchestration", "code-intel", "testing", "simplify", "plan-review"],
  phased: ["gsd", "plan-review", "task", "context"],
  "process-design": ["process", "plan-review", "task"],
  offline: ["memory"],
};

// 分配方法层：process 场景 / process-design 工作流装配时注入，
// 目的是让分配依据“每步的输入输出与判据”，而不是插件/技能名字像不像。
const ALLOCATION_METHOD = [
  "拆基元：workflow-refactor —— 每步的输入、输出、判据、人工还是自动",
  "定验收：spec-workflow-guide —— 需求边界、验收标准、谁验收",
  "固化：sop-builder / sop-extractor —— 阶段产物、退出条件、自检清单",
  "补缺口：skill-finder / find-skill-skillhub —— 先找现成能力，找不到再自造",
  "分配：按基元匹配插件与技能，并标明每一项服务于哪个基元",
];
const PROCESS_SKILL_IDS = ["workflow-refactor", "sop-builder", "sop-extractor", "spec-workflow-guide", "skill-finder"];

// 能力标签词表（阶段 B）：把"中文能力词"映射到能力角色。
// 与 CAPABILITIES 的正则互补——正则看名字，标签看描述里出现的具体能力。
const TAG_VOCAB = {
  表格: "data", 数据: "data", 图表: "data", 透视: "data", csv: "data", sql: "data", 统计: "data",
  幻灯片: "slides", ppt: "slides", 演示: "slides", 路演: "slides", 讲义: "slides",
  公文: "docx", 红头: "docx", 排版: "docx", 发文: "docx", 发文字号: "docx", 版记: "docx",
  海报: "design", 视觉: "design", 配色: "design", 界面: "design", ui: "design", 封面: "design",
  爬虫: "automation", 抓取: "automation", 定时: "automation", 调度: "automation", 批处理: "automation",
  翻译: "i18n", 本地化: "i18n", 多语言: "i18n",
  文案: "writing", 文章: "writing", 润色: "writing", 写作: "writing", 稿: "writing",
  文档: "docs", 手册: "docs", 教程: "docs", readme: "docs", wiki: "docs",
  代码: "code-intel", 诊断: "code-intel", 重构: "code-intel", lsp: "code-intel", 符号: "code-intel",
  流程: "process", sop: "process", 标准化: "process", 基元: "process",
  搜索: "web", 检索: "web", 抓网页: "web",
  图片: "vision", 识图: "vision",
  mcp: "mcp", 外部系统: "mcp", 集成: "mcp",
  任务: "task", 待办: "task", 清单: "task",
  记忆: "memory", 备忘: "memory",
  计划: "plan-review", 审阅: "plan-review", 评审: "plan-review",
  测试: "testing", 用例: "testing", 覆盖率: "testing",
  编排: "orchestration", 并行: "orchestration", 子代理: "orchestration",
};

function tagsOf(text) {
  const t = String(text || "").toLowerCase();
  const out = new Set();
  for (const [word, role] of Object.entries(TAG_VOCAB)) {
    if (t.includes(word)) out.add(role);
  }
  return [...out].sort();
}

// 需求里常出现“本机根本没能力”的交付形态（PDF、视频、配音、OCR…）。
// 这些词不属于任何固定场景，硬塞插件只会变成噪声：检测到缺口后由用户决定要不要去找。
// item 判断“装了没有”；exclude 排除反方向条目（markdown-converter 是 PDF→Markdown，不能算能生成 PDF）。
const NEED_CAPABILITIES = [
  { id: "pdf", label: "PDF 生成 / 转换", hint: "把内容排成 PDF（版式、字体、分页）", need: /\bpdf\b|pdf ?文件|pdf ?文档|导出 ?pdf|生成 ?pdf|做成 ?pdf/, item: /pdf|typst|weasyprint|reportlab|pdfkit|latex|pandoc/i, exclude: /to ?markdown|markdown|读取|解析|parse|ocr/i },
  { id: "slides", label: "演示文稿生成", hint: "生成可编辑的 .pptx / 幻灯片", need: /\bppt\b|pptx|幻灯片|演示文稿/, item: /ppt|pptx|slide|deck/i, exclude: /convert|markdown|读取|解析/i },
  { id: "docx", label: "Word / 正式排版", hint: "生成 .docx 或按国标排版", need: /\bdocx\b|word ?文档|公文|红头|正式发文/, item: /docx|gongwen|word|国标|排版/i, exclude: /to ?markdown|markdown|读取|解析/i },
  { id: "xlsx", label: "Excel / 表格处理", hint: "读写 .xlsx、透视、公式", need: /\bxlsx\b|\bexcel\b|表格|透视表/, item: /excel|xlsx|spreadsheet|pandas|openpyxl/i, exclude: /to ?markdown|markdown|读取|解析/i },
  { id: "video", label: "视频剪辑 / 合成", hint: "剪辑、加字幕、合成视频", need: /视频剪辑|剪辑|合成视频|加字幕|\bffmpeg\b|视频生成/, item: /ffmpeg|video|剪映|filmora|moviepy/i, exclude: /to ?markdown|markdown|下载|download/i },
  { id: "audio", label: "音频 / 配音 / 转写", hint: "TTS 配音、音频转写", need: /配音|\btts\b|语音合成|音频|转写|whisper/, item: /\btts\b|whisper|audio|配音|语音/i, exclude: /to ?markdown|markdown/i },
  { id: "ocr", label: "OCR / 扫描件识别", hint: "图片或扫描件转文字", need: /\bocr\b|扫描件|识别文字|图片转文字/, item: /\bocr\b|tesseract|paddleocr|扫描/i, exclude: /markdown|生成/i },
  { id: "imagegen", label: "图片生成 / 绘制", hint: "文生图、插画、海报配图", need: /文生图|生图|画一张|生成图片|插画|海报配图/, item: /image ?gen|stable ?diffusion|文生图|生图|dall|midjourney|插画/i, exclude: /describe|vision|识图|to ?markdown/i },
];

// 动态组合的预算与闸门：宁可少给、让模型/用户补，也不塞一堆无关工具。
// strongIntent：场景得分到这么高才算“确定命中”；弱命中时插件自身也得沾边才进组合。
const DYNAMIC_LIMITS = { packages: 5, skills: 5, perIntentSkills: 2, strongIntent: 2 };

// 固定应用场景：先选“做什么”，再选“怎么做”。
const SCENARIOS = [
  {
    id: "article", group: "内容", title: "文章 / 文案 / 博客",
    when: "公众号、博客、产品文案、改写润色、标题与结构",
    keywords: ["文章", "文案", "博客", "公众号", "写作", "改写", "润色", "标题", "稿件", "copy", "article", "blog", "post", "newsletter"],
    brief: "先确认读者、发布渠道和语气，再定标题与结构；成稿后做一次事实和措辞校对。",
  },
  {
    id: "report", group: "内容", title: "报告 / 调研 / 白皮书",
    when: "调研报告、方案对比、分析总结、带出处的长文",
    keywords: ["报告", "调研", "白皮书", "分析报告", "经营分析", "年报", "季报", "方案对比", "研究", "report", "research", "survey", "whitepaper"],
    brief: "先列问题与来源标准，再收集证据、对比方案；结论必须带出处，区分事实、推断和建议。",
  },
  {
    id: "presentation", group: "内容", title: "演示 / PPT / 路演",
    when: "幻灯片、课程讲义、路演材料、汇报提纲",
    keywords: ["ppt", "幻灯片", "演示", "路演", "讲义", "课件", "发布会", "宣讲", "答辩", "汇报", "slide", "deck", "presentation"],
    brief: "先定受众和一句话结论，再排叙事顺序；每页只表达一个观点，图少而准，最后检查演示节奏。",
  },
  {
    id: "docx", group: "内容", title: "公文 / 正式发文",
    when: "公文、红头文件、发文字号、材料排版、讲话稿、请示批复，要符合国标格式",
    keywords: ["公文", "红头文件", "发文字号", "版记", "主送机关", "讲话稿", "请示", "批复", "国标格式", "正式发文"],
    brief: "先确认文种、发文单位与主送机关，再按 GB/T 9704 版式排版；成文后核对发文字号、落款日期与版记。",
  },
  {
    id: "docs", group: "内容", title: "文档 / 教程 / 知识库",
    when: "README、使用手册、API 文档、教程、团队 wiki",
    keywords: ["文档", "教程", "手册", "wiki", "readme", "知识库", "指南", "说明", "adr"],
    brief: "先确认读者要完成什么，再按任务组织内容；示例必须可运行，路径和命令以实际项目为准。",
  },
  {
    id: "webpage", group: "产品", title: "网页 / 落地页 / 官网",
    when: "官网、落地页、个人主页、活动页、静态展示站",
    keywords: ["网页", "落地页", "官网", "主页", "个人站", "活动页", "landing page", "website", "homepage"],
    brief: "先定信息层级和视觉方向，再做首屏与响应式；文案、图片、按钮要有明确目的，最后用人眼验收关键尺寸。",
  },
  {
    id: "webapp", group: "产品", title: "Web 应用 / 管理后台",
    when: "SaaS、后台系统、仪表盘、表单工具、交互式产品",
    keywords: ["web 应用", "网站", "后台", "管理后台", "系统", "平台", "dashboard", "saas", "工具站", "功能"],
    brief: "先画清用户流程和数据流，再实现最小闭环；状态、空态、错误态都要设计，最后走一遍真实操作路径。",
  },
  {
    id: "mobile", group: "产品", title: "App / 小程序 / 移动端",
    when: "手机 App、小程序、移动端页面、响应式适配",
    keywords: ["app", "小程序", "移动端", "手机", "ios", "android", "responsive", "适配", "uni-app", "flutter", "react native"],
    brief: "先按真实设备宽度设计触控与信息密度，再实现导航、列表、表单；重点检查安全区、键盘和小屏溢出。",
  },
  {
    id: "game", group: "产品", title: "游戏 / 互动体验",
    when: "网页小游戏、互动玩具、可视化体验、游戏原型",
    keywords: ["游戏", "小游戏", "game", "互动", "玩法", "关卡", "canvas", "unity", "godot", "prototype"],
    brief: "先定核心循环（操作→反馈→奖励），再做可玩的最小原型；优先手感、帧率和失败重试，最后补音效与打磨。",
  },
  {
    id: "design", group: "视觉", title: "设计 / 品牌 / 视觉稿",
    when: "UI 稿、品牌视觉、logo、海报、配色与设计系统",
    keywords: ["设计", "视觉", "品牌", "logo", "配色", "字体", "排版", "设计系统", "design", "brand", "mockup"],
    brief: "先定风格板和三个关键词，再做主视觉与组件规范；检查对比度、层级、间距和不同尺寸下的一致性。",
  },
  {
    id: "data", group: "视觉", title: "数据 / 图表 / 分析",
    when: "数据分析、可视化、报表、指标解释、实验对比",
    keywords: ["数据", "图表", "可视化", "统计", "分析", "csv", "excel", "chart"],
    brief: "先明确问题和口径，再清洗、聚合、可视化；结论要给样本量、时间范围和不确定性，不把相关当因果。",
  },
  {
    id: "api", group: "系统", title: "API / 后端 / CLI",
    when: "接口服务、后端逻辑、命令行工具、可复用库",
    keywords: ["api", "接口", "后端", "服务", "命令行", "cli", "库", "sdk", "server", "endpoint", "rest", "graphql"],
    brief: "先定输入输出、错误码和边界条件，再实现最小接口；补契约测试和失败路径，最后写清调用示例。",
  },
  {
    id: "automation", group: "系统", title: "自动化 / 爬虫 / 定时任务",
    when: "脚本、数据采集、定时任务、重复流程自动化",
    keywords: ["自动化", "爬虫", "脚本", "定时", "批处理", "采集", "scrape", "crawl", "cron", "schedule", "batch"],
    brief: "先确认输入源、频率和失败策略，再做幂等的小步骤；记录日志和重试边界，避免无上限地抓取或写入。",
  },
  {
    id: "integration", group: "系统", title: "集成 / MCP / 外部系统",
    when: "接数据库、第三方 API、企业系统、MCP 服务器",
    keywords: ["mcp", "集成", "外部系统", "第三方", "数据库", "对接", "webhook", "oauth", "connector", "integration"],
    brief: "先画清数据流向、权限和失败模式，再做最小连通；密钥不落库，错误可重试，最后做断网和超时测试。",
  },
  {
    id: "plugin", group: "系统", title: "Pi 插件 / 扩展 / 工具",
    when: "Pi 扩展、自定义工具、技能、命令、钩子",
    keywords: ["插件", "扩展", "工具", "skill", "hook", "extension", "plugin", "command", "agent", "pi"],
    brief: "先确认扩展点（工具/命令/技能/钩子）和触发方式，再做最小可加载版本；错误要可诊断，最后在真实会话里验证。",
  },
  {
    id: "process", group: "流程", title: "流程 / SOP / 需求→流程映射",
    when: "把零散需求或口述经验变成可复用流程、SOP、作业指导，或给一条流程重新分配工具与技能",
    keywords: ["流程", "工作流", "sop", "需求分析", "需求拆解", "需求梳理", "标准化", "作业指导", "交接", "规范", "编排", "分配", "workflow", "process", "requirement"],
    brief: "先把需求拆到基元（每步的输入/输出/判据），再定验收标准，然后写成带退出条件的 SOP；最后才按基元挑插件和技能。",
  },
  {
    id: "maintain", group: "维护", title: "现有项目维护 / 修 bug",
    when: "修 bug、重构、补测试、性能优化、依赖升级、代码评审",
    keywords: ["bug", "报错", "修复", "重构", "测试", "评审", "性能", "依赖", "升级", "迁移", "维护", "refactor", "fix", "test", "review", "upgrade"],
    brief: "先复现或建立基线，再做最小改动；每步验证，最后跑回归并说明风险，不顺手扩大范围。",
  },
  {
    id: "localization", group: "维护", title: "本地化 / 翻译 / 多语言",
    when: "界面翻译、文案本地化、多语言资源、术语统一",
    keywords: ["翻译", "本地化", "多语言", "i18n", "locale", "language", "术语", "translation"],
    brief: "先定术语表和语气，再按 key 改资源文件；保持占位符和格式不变，最后检查截断、复数与从右到左布局。",
  },
  {
    id: "social", group: "内容", title: "社交媒体 / 种草 / 推文",
    when: "小红书、微博、推特、朋友圈、种草与运营文案",
    keywords: ["小红书", "微博", "推特", "twitter", "推文", "朋友圈", "种草", "社交", "运营", "social", "post", "thread", "caption"],
    brief: "先定平台、受众和发布目标，再写钩子与正文；遵守平台字数与标签习惯，最后检查事实和合规。",
  },
  {
    id: "novel", group: "内容", title: "小说 / 故事 / 剧本",
    when: "短篇、长篇章节、剧本、角色设定、世界观与同人",
    keywords: ["小说", "故事", "剧本", "章节", "角色", "世界观", "同人", "剧情", "novel", "story", "fiction", "screenplay"],
    brief: "先定题材、视角和核心冲突，再搭人物与章节；保持伏笔和节奏，最后统一设定与文风。",
  },
  {
    id: "video", group: "内容", title: "视频 / 播客 / 分镜",
    when: "短视频脚本、口播稿、分镜、字幕、播客提纲",
    keywords: ["视频", "短视频", "口播", "分镜", "字幕", "播客", "音频", "video", "podcast", "storyboard", "subtitle"],
    brief: "先定时长、平台和核心信息，再写开场钩子与分镜；字幕和口播要顺口，最后核对画面与版权。",
  },
  {
    id: "image", group: "视觉", title: "海报 / 封面 / 配图",
    when: "海报、封面、插图、社媒配图、图片生成提示词",
    keywords: ["海报", "封面", "配图", "插图", "图片", "绘图", "出图", "渲染", "建模", "模型", "3d", "prompt", "poster", "cover", "illustration", "image"],
    brief: "先定尺寸、用途和视觉关键词，再写画面描述或提示词；主体、文字区和留白要清楚，最后检查版权与可读性。",
  },
  {
    id: "course", group: "内容", title: "课程 / 教学 / 培训",
    when: "课程大纲、教案、课件、作业、培训材料",
    keywords: ["课程", "教学", "教案", "培训", "课件", "作业", "考试", "学习计划", "course", "lesson", "curriculum", "training"],
    brief: "先定学习目标和先修知识，再按小节组织讲解与练习；每节有可验收的产出，最后配答案与复习。",
  },
  {
    id: "resume", group: "内容", title: "简历 / 求职 / 作品集",
    when: "简历、求职信、面试介绍、作品集与个人品牌",
    keywords: ["简历", "求职", "面试", "岗位", "招聘", "投递", "作品集", "自我介绍", "求职信", "cv", "resume", "portfolio", "interview"],
    brief: "先定目标岗位和差异化证据，再用结果与数字写经历；一页优先，最后针对 JD 调整关键词。",
  },
  {
    id: "event", group: "内容", title: "活动 / 旅行 / 生活策划",
    when: "活动方案、旅行行程、婚礼或聚会策划、预算清单",
    keywords: ["活动", "策划", "旅行", "行程", "婚礼", "聚会", "预算", "清单", "event", "travel", "itinerary", "planning"],
    brief: "先定目标、人数、预算和日期，再排时间线与分工；留出天气或取消等备选，最后输出可执行清单。",
  },
  {
    id: "commerce", group: "产品", title: "电商 / 商品页 / 店铺",
    when: "商品详情页、店铺首页、购物车、订单与支付流程",
    keywords: ["电商", "商品", "店铺", "详情页", "购物车", "订单", "支付", "ecommerce", "shop", "product", "checkout"],
    brief: "先定商品卖点和购买路径，再做详情页或结算闭环；价格、库存、运费和退款规则要清楚，最后走一遍下单。",
  },
  {
    id: "dashboard", group: "产品", title: "仪表盘 / BI / 报表",
    when: "数据看板、BI 报表、指标监控、运营后台",
    keywords: ["仪表盘", "看板", "bi", "报表", "指标", "监控", "dashboard", "analytics", "report"],
    brief: "先定使用者和决策问题，再选 3-5 个核心指标；图表服务结论，最后检查口径、刷新和空数据状态。",
  },
  {
    id: "tool", group: "系统", title: "小工具 / 脚本 / CLI",
    when: "本地小工具、文件处理、格式转换、命令行脚本",
    keywords: ["小工具", "脚本", "命令行", "cli", "文件处理", "转换", "批处理", "tool", "utility", "script", "converter"],
    brief: "先定输入输出和一个真实样例，再做最小可运行脚本；错误输入要有提示，最后在干净目录验证。",
  },
  {
    id: "chatbot", group: "系统", title: "AI 对话 / 机器人 / 客服",
    when: "聊天机器人、知识库问答、客服助手、AI 工作流",
    keywords: ["聊天机器人", "对话", "客服", "问答", "助手", "bot", "chatbot", "assistant", "rag", "knowledge base"],
    brief: "先定知识边界、人格和失败兜底，再设计检索或工具调用；回答要可追溯，最后测试越界与转人工。",
  },
  {
    id: "email", group: "内容", title: "邮件 / 通知 / 营销",
    when: "邮件、通知、邀请函、营销邮件与 newsletter",
    keywords: ["邮件", "email", "newsletter", "通知", "邀请函", "营销邮件", "续费", "客户信", "订阅", "mail"],
    brief: "先定收件人、目的和行动按钮，再写主题与正文；一封信只做一件事，最后检查链接、称呼与退订。",
  },
  {
    id: "music", group: "内容", title: "音乐 / 歌词 / 配乐",
    when: "歌词、歌曲结构、配乐方向、音乐提示词",
    keywords: ["音乐", "歌词", "歌曲", "编曲", "配乐", "旋律", "主题曲", "作曲", "填词", "music", "lyrics", "song", "soundtrack"],
    brief: "先定情绪、曲风和段落结构，再写歌词或提示词；主歌/副歌要有对比，最后检查押韵、时长与版权。",
  },
  {
    id: "spreadsheet", group: "视觉", title: "表格 / Excel / 对账",
    when: "表格模板、公式、数据录入、对账与批量整理",
    keywords: ["表格", "excel", "spreadsheet", "公式", "对账", "录入", "csv", "台账", "统计表"],
    brief: "先定字段、口径和一行样例，再建公式与校验；冻结表头、标出异常，最后用真实数据试算。",
  },
  {
    id: "legal", group: "内容", title: "合同 / 条款 / 隐私政策",
    when: "合同条款、用户协议、隐私政策、合规说明",
    keywords: ["合同", "条款", "协议", "隐私政策", "合规", "免责声明", "legal", "contract", "terms", "privacy policy"],
    brief: "先定适用主体、地区和业务范围，再列权利义务与例外；用清晰短句，标出需律师确认的条款，不冒充法律意见。",
  },
  {
    id: "general", group: "通用", title: "其他 / 通用任务",
    when: "不确定归哪类、跨多个产出、先讨论方案或要第二意见",
    keywords: ["通用任务", "其他任务", "不确定", "第二意见", "顾问", "general"],
    fallback: true,
    brief: "先澄清目标、交付物和边界，再决定是否需要拆分；不确定时先给一个最小可验证方案，不硬套模板。",
  },
];

// 固定工作流：只描述怎么做，不绑定任何具体插件或技能。
const WORKFLOWS = [
  {
    id: "direct", title: "直接产出",
    picker: "需求清楚、范围小；直接做，不先写计划",
    when: "需求清楚、范围小，想马上看到结果。",
    keywords: ["直接", "快速", "小任务", "direct", "quick"],
    brief: "直接做最小可验证的产出，不写额外计划文档，不扩大范围。",
    steps: ["读清目标与约束", "直接产出最小可验证版本", "自检并交付"],
    checkpoint: "不做方案评审；遇到范围不清才停下来问。",
    doneWhen: "目标要求全部覆盖，且完成一次自检。",
  },
  {
    id: "outline", title: "结构 / 原型先行",
    picker: "先出提纲或最小原型，确认方向再展开",
    when: "先要提纲、方案、目录、实施步骤，或先做能看能点的最小原型。",
    keywords: ["提纲", "结构", "方案", "计划", "目录", "原型", "草稿", "最小样", "先做一版", "outline", "plan", "prototype", "draft", "mvp"],
    brief: "先只出结构、方案或最小原型，不展开全文和完整实现；确认方向后再补细节。",
    steps: ["提炼目标、受众和验收标准", "输出提纲/方案，或做出能看能点的最小原型", "等待用户确认方向", "按确认的结构展开并补细节"],
    checkpoint: "结构或原型未确认前，不写完整正文、不堆功能、不做精修。",
    doneWhen: "方向被确认，结构覆盖目标或核心路径可走通。",
  },
  {
    id: "research", title: "证据先行",
    picker: "先查证，再下结论",
    when: "事实不确定、需要多源对比，或结论必须能追溯出处。",
    keywords: ["调研", "查证", "来源", "对比", "事实", "research", "evidence", "source"],
    brief: "先列问题，再收集多源证据；区分事实、推断和建议，冲突不抹平。",
    steps: ["拆出必须回答的问题", "收集多源证据并记录出处", "交叉核对，标出冲突和空白", "输出带出处的结论"],
    checkpoint: "证据不足时明确说不足，不编造来源。",
    doneWhen: "关键结论都有出处，冲突已说明。",
  },
  {
    id: "debug", title: "排查修复",
    picker: "先复现和定位，再改",
    when: "有明确故障、报错或行为异常，需要找到根因并验证修复。",
    keywords: ["排查", "调试", "复现", "根因", "报错", "debug", "fix"],
    brief: "先复现，再缩小范围找根因；只做最小修复，最后回归验证。",
    steps: ["复现问题并记录环境", "缩小范围，定位根因", "做最小修复", "回归验证并补防复发检查"],
    checkpoint: "根因未确认前不猜测性大改。",
    doneWhen: "原问题消失，回归检查通过。",
  },
  {
    id: "parallel", title: "并行探索",
    picker: "拆成独立部分，多路同时推进",
    when: "任务能拆成互不依赖的几块，或需要多方案对比。",
    keywords: ["并行", "多方案", "子代理", "拆开", "parallel", "fanout", "variants"],
    brief: "只并行真正独立的部分；没有并行工具时按同样边界顺序推进。",
    steps: ["列出独立工作包和边界", "多路推进或多方案产出", "汇总、去重、解决冲突", "统一验收"],
    checkpoint: "共享状态或强依赖的部分不并行。",
    doneWhen: "各工作包合并后通过统一验收。",
  },
  {
    id: "review-gate", title: "评审 / 迭代守门",
    picker: "完成后独立审查，按反馈改关键差距，再交付",
    when: "高风险改动、发布前检查、重要文档，或需要按反馈多轮打磨。",
    keywords: ["评审", "审查", "守门", "第二遍", "迭代", "打磨", "反馈", "改一版", "review", "gate", "iterate", "refine"],
    brief: "先自查，再做独立审查或收集反馈；只改最影响结果的部分，重新验证后交付。",
    steps: ["完成初稿或改动", "按清单独立审查，或对照标准收集反馈", "只修关键问题与差距", "重新验证后交付"],
    checkpoint: "审查未通过不交付；没有新反馈或明确差距时停止迭代。",
    doneWhen: "审查清单通过，且修复后重新验证；或达到验收标准且改动可追溯。",
  },
  {
    id: "phased", title: "阶段推进",
    picker: "先规格和计划，再分阶段验收",
    when: "多阶段长任务，需要规格、计划、逐阶段验收。",
    keywords: ["阶段", "里程碑", "规格", "长任务", "phased", "milestone", "spec"],
    brief: "先规格再计划，逐阶段执行和验收；每阶段确认后再进入下一阶段。",
    steps: ["写规格与验收标准", "拆分阶段计划和依赖", "逐阶段执行", "每阶段验收后续接"],
    checkpoint: "上一阶段未验收，不开始下一阶段。",
    doneWhen: "所有阶段验收通过，整体目标可演示。",
  },
  {
    id: "process-design", title: "流程建模 / SOP 固化",
    picker: "先把流程拆成基元，再固化成带退出条件的 SOP",
    when: "要把零散需求或口述经验改成可复用流程，或按流程重新分配工具与技能。",
    keywords: ["流程", "工作流", "sop", "标准化", "固化", "拆解", "需求梳理", "workflow", "process"],
    brief: "先拆基元（每步的输入、输出、判据），再定验收标准，再写成带阶段产物和退出条件的 SOP；最后才按基元分配插件与技能。",
    steps: ["拆基元：每步的输入、输出、判据、人工/自动", "定验收：需求边界、验收标准、谁验收", "固化 SOP：阶段目标、关键步骤、阶段产物、退出条件、自检清单", "补缺口：按基元找现成能力，找不到再自造", "分配工具：按基元匹配插件与技能，并标明每项对应的基元"],
    checkpoint: "基元和验收标准没定清楚前，不开始挑插件和技能。",
    doneWhen: "每个基元都有承担者（人或工具）和判据，SOP 能照着走通一遍。",
  },
  {
    id: "offline", title: "隐私 / 离线",
    picker: "只用本地工具，不联网",
    when: "敏感内容、不能外发，或需要最小联网面。",
    keywords: ["隐私", "离线", "敏感", "保密", "内网", "offline", "privacy"],
    brief: "默认不联网、不使用外部服务；必须联网时先说明并征得同意。",
    steps: ["盘点本地可用资料和工具", "不发起网络请求", "完成本地可做的部分", "标出必须联网才能完成的部分"],
    checkpoint: "任何联网动作都要先征得同意。",
    doneWhen: "本地部分完成，联网缺口已列清。",
  },
];

// 自动归类信号：只写能力词，不写具体插件名。
const SCENARIO_HINTS = {
  docx: ["gongwen", "公文", "docx", "红头", "发文字号"],
  article: ["writing", "copy", "blog", "article", "文案", "文章"],
  email: ["email", "newsletter", "mail", "邮件", "通知", "邀请函"],
  social: ["social", "xiaohongshu", "twitter", "thread", "种草", "小红书", "推文", "社交"],
  novel: ["novel", "story", "fiction", "screenplay", "小说", "故事", "剧本", "章节"],
  video: ["video", "podcast", "storyboard", "subtitle", "视频", "播客", "分镜", "字幕"],
  music: ["music", "lyrics", "song", "soundtrack", "音乐", "歌词", "配乐"],
  image: ["poster", "cover", "illustration", "image", "海报", "封面", "配图", "插图"],
  course: ["course", "lesson", "curriculum", "training", "课程", "教学", "课件", "培训"],
  resume: ["resume", "cv", "portfolio", "interview", "简历", "求职", "面试", "作品集"],
  event: ["event", "travel", "itinerary", "活动", "旅行", "行程", "策划"],
  report: ["research", "report", "survey", "whitepaper", "调研", "报告"],
  presentation: ["slide", "deck", "presentation", "ppt", "幻灯片"],
  docs: ["documentation", "docs", "wiki", "readme", "handoff", "mermaid", "文档"],
  legal: ["legal", "contract", "terms", "privacy", "合同", "条款", "隐私政策"],
  webpage: ["webpage", "landing", "website", "homepage", "网页", "落地页"],
  webapp: ["webapp", "dashboard", "saas", "admin", "frontend", "web", "应用", "后台"],
  mobile: ["mobile", "ios", "android", "mini program", "responsive", "移动端", "小程序"],
  game: ["game", "canvas", "gameplay", "游戏", "玩法", "关卡"],
  design: ["design", "brand", "visual", "logo", "css", "ui", "设计", "视觉"],
  data: ["data", "chart", "analytics", "csv", "sql", "数据", "图表"],
  spreadsheet: ["spreadsheet", "excel", "formula", "表格", "公式", "对账"],
  dashboard: ["dashboard", "bi", "analytics", "报表", "看板", "指标"],
  commerce: ["ecommerce", "shop", "product", "checkout", "电商", "商品", "店铺"],
  api: ["api", "backend", "server", "cli", "sdk", "接口", "后端"],
  automation: ["automation", "scrape", "crawl", "cron", "schedule", "自动化", "爬虫"],
  tool: ["tool", "utility", "script", "cli", "小工具", "脚本", "命令行"],
  integration: ["mcp", "integration", "connector", "oauth", "webhook", "集成"],
  chatbot: ["chatbot", "assistant", "rag", "客服", "聊天机器人", "问答"],
  plugin: ["plugin", "extension", "hook", "skill", "command", "插件", "扩展"],
  process: ["workflow", "sop", "process", "requirement", "spec", "流程", "工作流", "需求", "标准化", "分配"],
  maintain: ["bug", "refactor", "test", "review", "performance", "upgrade", "维护", "重构", "测试"],
  localization: ["i18n", "locale", "translation", "language", "本地化", "翻译"],
  general: ["general", "other", "misc", "通用", "其他"],
};


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
function storePath() {
  // 测试隔离接口：设置 PI_FUNCTION_STORE 可把目录指到临时文件，
  // 测试就永远不会碰到真实 store（真实会话有 watcher 在写）。
  return process.env.PI_FUNCTION_STORE || path.join(agentDir(), STORE_FILE);
}

// ---------------------------------------------------------------------------
// 用户能力画像：只识别“这台机器装了什么能力”，不假设插件名
// ---------------------------------------------------------------------------
const PROFILE_FILE = "function-menu.profile.json";
const PROFILE_VERSION = 7;
let ACTIVE_PROFILE = null;

function profilePath() { return process.env.PI_FUNCTION_PROFILE || path.join(agentDir(), PROFILE_FILE); }

function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

function profileFingerprint(store) {
  const parts = Object.entries(store.known || {})
    .filter(([, m]) => m && !m.missing)
    .map(([id, m]) => `${id}@${m.version || ""}:${m.description || ""}`)
    .sort();
  return hashText(`v${PROFILE_VERSION}|` + parts.join("|"));
}

function buildProfile(store) {
  const roles = {};
  for (const [id, def] of Object.entries(CAPABILITIES)) {
    roles[id] = { id, label: def.label, network: !!def.network, infra: !!def.infra, packages: [], skills: [] };
  }
  const itemInfo = {};
  const unassigned = [];

  for (const [rawId, meta] of Object.entries(store.known || {})) {
    if (!meta || meta.missing) continue;
    const isSkill = rawId.startsWith("skill:");
    const name = rawId.replace(/^npm:/, "").replace(/^skill:/, "");
    if (!isSkill && rawId.startsWith("local:")) continue;
    const isGsdSkill = isSkill && /^gsd-/.test(name);
    const text = norm([
      name, meta.label || "", meta.description || "", meta.text || "",
      ...(meta.tools || []), ...(meta.commands || []), ...(meta.skills || []),
    ].join(" ")).slice(0, 6000);
    const candidates = [];
    for (const [roleId, def] of Object.entries(CAPABILITIES)) {
      if (isGsdSkill && roleId !== "gsd") continue;
      if (isSkill && roleId === "writing" && /^(ppt|slide|deck|mermaid|glimpse)/i.test(name)) continue;
      // 流程建模类技能归 process，不算“多代理编排 / 代码重构”。
      if (isSkill && (roleId === "orchestration" || roleId === "code-intel")
        && /^(workflow-refactor|sop-(builder|extractor)|spec-workflow|skill-finder)/i.test(name)) continue;
      if (!isSkill && def.requiresEnv && def.envPackage && def.envPackage.test(name) && !process.env[def.requiresEnv]) continue;
      const strongName = isSkill ? def.skill?.test(norm(name)) : def.package?.test(norm(name));
      if (def.deny && !strongName && def.deny.test(norm(`${name} ${text}`))) continue;
      let score = 0;
      const reasons = [];
      const hit = (re, value, weight, why) => {
        if (re && value && re.test(norm(value))) { score += weight; reasons.push(why); }
      };
      if (isSkill) {
        hit(def.skill, name, 5, "技能名");
        hit(def.terms, text, 1, "描述");
      } else {
        hit(def.package, name, 5, "包名");
        for (const tool of meta.tools || []) hit(def.tool, tool, 3, "工具");
        for (const cmd of meta.commands || []) hit(def.command, cmd, 3, "命令");
        for (const skill of meta.skills || []) hit(def.skill, skill, 2, "技能");
        hit(def.terms, text, 1, "描述");
      }
      if (score < (def.minScore ?? 2)) continue;
      candidates.push({ roleId, score, reasons: uniq(reasons) });
    }
    // 一个包/技能最多进入 3 个包角色或 2 个技能角色，按证据强度取前几名。
    const selected = candidates
      .sort((a, b) => b.score - a.score || a.roleId.localeCompare(b.roleId))
      .slice(0, isSkill ? 2 : 3);
    for (const item of selected) {
      // 基础设施角色（context/safety/pretty）只用于打标记，不进入能力名单：
      // 否则它们会占满角色的 12 个名额，把真正可分配的技能挤出去。
      if (CAPABILITIES[item.roleId]?.infra) continue;
      const role = roles[item.roleId];
      const rec = { id: name, score: item.score, reasons: item.reasons };
      if (isSkill) role.skills.push(rec); else role.packages.push(rec);
    }
    if (!selected.length) unassigned.push(rawId);
    itemInfo[name] = {
      id: name,
      kind: isSkill ? "skill" : "plugin",
      description: meta.description || "",
      tags: uniq([
        ...tagsOf([name, meta.description || "", ...(meta.tools || []), ...(meta.commands || [])].join(" ")),
        ...selected.filter((x) => !CAPABILITIES[x.roleId]?.infra).map((x) => x.roleId),
      ]).sort(),
      roles: selected.map((x) => x.roleId),
      roleScores: Object.fromEntries(selected.map((x) => [x.roleId, x.score])),
      assignments: selected,
      network: Object.values(roles).some((r) => r.network && (r.packages.some((p) => p.id === name) || r.skills.some((s) => s.id === name))),
      // infra 不再靠角色名单判断（它们已不进名单），直接用归类结果
      infra: selected.some((x) => CAPABILITIES[x.roleId]?.infra),
    };
  }

  for (const role of Object.values(roles)) {
    role.packages.sort((a, b) => b.score - a.score);
    role.skills.sort((a, b) => b.score - a.score);
    role.packages = role.packages.slice(0, 3);
    role.skills = role.skills.slice(0, 12);
  }
  return {
    version: 1,
    generatedAt: nowIso(),
    fingerprint: profileFingerprint(store),
    roles,
    itemInfo,
    unassigned: unassigned.slice(0, 40),
    counts: {
      packages: Object.values(roles).reduce((n, r) => n + r.packages.length, 0),
      skills: Object.values(roles).reduce((n, r) => n + r.skills.length, 0),
    },
  };
}

function hydrateCatalog(profile) {
  ACTIVE_PROFILE = profile;
  for (const scenario of SCENARIOS) {
    const roles = SCENARIO_CAPABILITIES[scenario.id] || [];
    const pkgs = [];
    const skills = [];
    for (const roleId of roles) {
      const role = profile?.roles?.[roleId];
      if (!role || role.infra) continue;
      pkgs.push(...role.packages.slice(0, 2).map((x) => x.id));
      skills.push(...role.skills.map((x) => x.id));
    }
    scenario.plugins = uniq(pkgs);
    scenario.capabilities = roles;
    scenario.manual = [];
    scenario.profileSkills = uniq(skills);
  }
  for (const workflow of WORKFLOWS) {
    const roles = WORKFLOW_CAPABILITIES[workflow.id] || [];
    const pkgs = [];
    const skills = [];
    for (const roleId of roles) {
      const role = profile?.roles?.[roleId];
      if (!role || role.infra) continue;
      pkgs.push(...role.packages.slice(0, 1).map((x) => x.id));
      skills.push(...role.skills.slice(0, 2).map((x) => x.id));
    }
    const rules = WORKFLOW_SKILL_PATTERNS[workflow.id] || {};
    const isOffline = workflow.id === "offline";
    const candidates = uniq(skills)
      .map((id) => ({ id, info: profile?.itemInfo?.[id] }))
      .filter((x) => !(isOffline && x.info?.network));
    const textOf = (x) => norm(`${x.id} ${x.info?.description || ""}`);
    let picked = candidates.filter((x) => {
      const text = textOf(x);
      if (rules.allow && !rules.allow.test(text)) return false;
      if (rules.deny && rules.deny.test(text)) return false;
      return true;
    });
    if (!picked.length) picked = candidates;
    workflow.plugins = uniq(pkgs).slice(0, 8);
    workflow.skills = picked.map((x) => x.id).slice(0, 8);
    workflow.capabilities = roles;
    workflow.manual = [];
  }
}

function ensureProfile(store, force = false) {
  const fingerprint = profileFingerprint(store);
  if (!force && ACTIVE_PROFILE && ACTIVE_PROFILE.fingerprint === fingerprint) {
    hydrateCatalog(ACTIVE_PROFILE);
    return ACTIVE_PROFILE;
  }
  const profile = buildProfile(store);
  profile.fingerprint = fingerprint;
  ACTIVE_PROFILE = profile;
  writeJson(profilePath(), profile);
  hydrateCatalog(profile);
  return profile;
}

function loadStore() {
  const raw = readJson(storePath(), null);
  if (!raw || typeof raw !== "object") return { version: 1, updatedAt: nowIso(), known: {}, overrides: {}, isNew: true };
  return {
    version: 1,
    classifierVersion: raw.classifierVersion || 0,
    updatedAt: raw.updatedAt || nowIso(),
    known: raw.known && typeof raw.known === "object" ? raw.known : {},
    overrides: raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {},
    // 使用反馈（阶段 D）：装配计数与手动归类计数
    usage: raw.usage && typeof raw.usage === "object" ? raw.usage : {},
    itemUse: raw.itemUse && typeof raw.itemUse === "object" ? raw.itemUse : {},
    manualAdds: raw.manualAdds && typeof raw.manualAdds === "object" ? raw.manualAdds : {},
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
      // 同分时用命中词总长度决胜：「经营分析报告」比「报告」更具体
      const weight = hits.reduce((n, hit2) => n + norm(hit2).length, 0);
      return { scenario: s, score, hits, weight };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.weight - a.weight);
}

const NEED_STOP = new Set([
  "一个", "这个", "那个", "一下", "一些", "可以", "需要", "进行", "使用", "实现", "功能", "问题", "项目", "代码", "文件", "内容", "工作", "任务", "系统", "支持", "相关", "主要", "直接", "重新", "开始", "完成", "处理", "提供", "查看", "检查", "如何", "怎么", "什么", "为什么", "帮我", "然后", "最后", "以及", "并且", "或者", "如果", "已经", "没有", "现在", "我的", "我们", "你们", "他们", "一下", "一点", "有些", "这种", "那种",
]);

// 描述侧要忽略的词：几乎每个插件/技能描述里都写得有，命中它们证明不了相关性。
const GENERIC_TERMS = new Set([
  "插件", "工具", "技能", "扩展", "命令", "工作流", "流程", "文档", "格式", "功能", "专业", "标准",
  "自动", "生成", "帮助", "支持", "可以", "需要", "使用", "进行", "完成", "处理", "提供", "包括",
  "各种", "多个", "不同", "部分", "全部", "用户", "内容", "设计", "分析", "优化", "管理", "技术",
  "方法", "能力", "场景", "基础", "简单", "快速",
  "skill", "skills", "tool", "tools", "plugin", "plugins", "workflow", "file", "files", "format",
  "document", "docs", "data", "code", "test", "tests", "agent", "agents", "api", "cli", "app", "web",
  "note", "notes", "image", "video", "text", "the", "and", "for",
]);

function termScoreDistinct(terms, text) {
  const t = norm(text);
  // 只保留最长匹配：“当用”这类 3 字切碎片段被“当用户”包含时不计分，
  // 否则任何描述里的套话都能被对话噪声蹭中。
  const matched = uniq(terms.filter((term) => term && !GENERIC_TERMS.has(term) && t.includes(term)))
    .filter((term) => !terms.some((other) => other && other !== term && other.length > term.length && other.includes(term) && t.includes(other)));
  let score = 0;
  for (const term of matched) score += 1 + Math.min(term.length, 8) / 10;
  return { score: Number(score.toFixed(2)), hits: matched.slice(0, 12) };
}

function needTerms(text) {
  const s = norm(text);
  const out = [];
  for (const m of s.match(/[a-z][a-z0-9+.#_-]{1,}/g) || []) out.push(m);
  for (const seg of s.match(/[\u4e00-\u9fff]+/g) || []) {
    if (seg.length >= 2) out.push(seg);
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= seg.length; i++) out.push(seg.slice(i, i + n));
    }
  }
  // 虚词开头的 n-gram（做个/一份/这个/我们…）是纯噪声：它们能匹配上任何描述里的套话。
  const FUNC_HEAD = /^[的了个份张页次一这那我们你他们做看写说要会能有是在和与就都也还又很太更最把被给对从向到为以]/;
  const FUNC_TAIL = /[的了个们吗呢吧啊哦嘛]$/;
  return uniq(out.filter((t) => t.length >= 2 && !NEED_STOP.has(t) && !FUNC_HEAD.test(t) && !FUNC_TAIL.test(t)));
}

function termScore(terms, text) {
  const t = norm(text);
  let score = 0;
  const hits = [];
  for (const term of terms) {
    if (term && t.includes(term)) {
      score += 1 + Math.min(term.length, 8) / 10;
      if (hits.length < 12) hits.push(term);
    }
  }
  return { score: Number(score.toFixed(2)), hits: uniq(hits) };
}

// 自由文本需求不做单选场景匹配；先取多个任务信号，再按能力描述组合插件/技能。
// 阶段 C：名额分配用集合覆盖，而不是"按分数取前 N"。
// 先保证 required 能力与需求标签被覆盖，其余名额只给"能覆盖新标签"的候选。
function selectByCoverage(candidates, limit, demands) {
  if (!limit || !candidates.length) return [];
  const demandSet = new Set(demands || []);
  const remaining = [...candidates].sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  const chosen = [];
  const covered = new Set();
  while (chosen.length < limit && remaining.length && covered.size < demandSet.size) {
    let best = null;
    let bestGain = 0;
    for (const cand of remaining) {
      // 角色是权威证据（分类器给的），标签只作补充：描述里出现"代码"不代表它是代码理解工具。
      const roles = (cand.roles || []).filter((r) => demandSet.has(r) && !covered.has(r));
      const tags = (cand.tags || []).filter((t) => demandSet.has(t) && !covered.has(t) && !(cand.roles || []).includes(t));
      const gain = roles.length * 2 + tags.length;
      if (gain > bestGain) { best = cand; bestGain = gain; }
    }
    if (!best) break;
    chosen.push(best);
    for (const t of [...(best.roles || []), ...(best.tags || [])]) if (demandSet.has(t)) covered.add(t);
    remaining.splice(remaining.indexOf(best), 1);
  }
  // 不给剩余名额硬塞：没覆盖到的新需求，宁可不给（少了会说漏用，多了没人发现）
  return chosen;
}

function analyzeNeed(text, store = { known: {} }) {
  const raw = String(text || "").trim();
  const terms = needTerms(raw);
  const scored = scoreScenarios(raw);
  const intents = (() => {
    // 兜底场景（general）只在没有一个具体场景命中时才充当意图，
    // 否则一句“帮我看看”就会把 web/memory/task 整套能力拖进组合。
    const specific = scored.filter((r) => r.score > 0 && !r.scenario.fallback);
    return (specific.length ? specific : scored.filter((r) => r.score > 0)).slice(0, 4);
  })();
  const packages = new Map();
  const skills = new Map();
  // 本次需求涉及的能力角色：不在这些角色里的插件/技能一律不进入动态组合。
  // 这是“只用相关工具”的主闸门，描述里碰巧含个“工作流”“文件”不再能混进来。
  const topIntent = intents[0];
  const roleIntents = topIntent
    ? intents.filter((r, i) => i === 0 || r.score >= topIntent.score * 0.8)
    : [];
  const wantedRoles = new Set(roleIntents.flatMap((r) => SCENARIO_CAPABILITIES[r.scenario.id] || []));
  const topScenario = intents[0]?.scenario; // 使用反馈加分与覆盖兜底都按首要场景算
  const inWantedRole = (info) => {
    if (!wantedRoles.size) return true;
    // 没归类（roles 为空）或根本不在画像里的条目不受角色闸门限制，
    // 否则像公文排版这种“能力独一无二、归不进任何角色”的技能会被永久漏掉。
    const roles = info?.roles || [];
    if (!roles.length) return true;
    return roles.some((role) => wantedRoles.has(role));
  };
  const privateNeed = /隐私|离线|敏感|保密|内网|不能外发|offline|privacy/.test(norm(raw));
  const useMcp = /\bmcp\b|外部系统|外部服务|外部 api|连接器|接入.*(?:系统|服务)/.test(norm(raw));
  const addPkg = (pkg, score, reason) => {
    const info = ACTIVE_PROFILE?.itemInfo?.[pkg];
    if (!pkg || info?.infra) return;
    if (info?.roles?.includes("mcp") && !useMcp) return;
    if (privateNeed && info?.network) return;
    const rec = packages.get(pkg) || { pkg, score: 0, reasons: [] };
    rec.score += score;
    if (reason) rec.reasons.push(reason);
    packages.set(pkg, rec);
  };
  const addSkill = (skill, score, reason) => {
    const rec = skills.get(skill) || { skill, score: 0, reasons: [] };
    rec.score += score;
    if (reason) rec.reasons.push(reason);
    skills.set(skill, rec);
  };

  for (const r of intents) {
    const signal = r.hits.slice(0, 4).join(" / ") || r.scenario.id;
    const strong = r.score >= DYNAMIC_LIMITS.strongIntent;
    for (const pkg of r.scenario.plugins) {
      // 弱命中：插件自身也得命中需求词，否则不进组合。
      const info = ACTIVE_PROFILE?.itemInfo?.[pkg];
      const own = termScoreDistinct(terms, `${pkg} ${info?.description || ""}`);
      if (!strong && own.score === 0) continue;
      addPkg(pkg, r.score + 1 + own.score + usageBoost(store, r.scenario.id, pkg), `任务信号：${r.scenario.title}（${signal}）`);
    }
    const curated = scenarioSkillIds(store, r.scenario.id).slice(0, DYNAMIC_LIMITS.perIntentSkills);
    curated.forEach((skill, idx) => {
      const meta = store.known?.[`skill:${skill}`] || {};
      const hit = termScoreDistinct(terms, `${skill} ${meta.description || ""}`);
      // 不再无条件兜底：没命中就只保留“确定命中场景”的首个常用技能。
      if (hit.score === 0 && !(strong && idx === 0)) return;
      const reason = hit.score > 0
        ? `任务信号：${r.scenario.title}（${hit.hits.slice(0, 3).join(" / ")}）`
        : `任务候选：${r.scenario.title} 的首选技能`;
      addSkill(skill, (hit.score > 0 ? r.score + hit.score : r.score * 0.5) + usageBoost(store, r.scenario.id, skill), reason);
    });
  }

  for (const [pkg, info] of Object.entries(ACTIVE_PROFILE?.itemInfo || {})) {
    if (info?.kind !== "plugin") continue;
    if (info.infra) continue;
    if (!inWantedRole(info)) continue;
    const roleText = (info.roles || []).map((r) => CAPABILITIES[r]?.label || r).join(" ");
    const hit = termScoreDistinct(terms, `${pkg} ${info.description || ""} ${roleText}`);
    if (hit.score >= 1.5) addPkg(pkg, hit.score + usageBoost(store, topScenario?.id, pkg), `能力描述命中：${hit.hits.slice(0, 3).join(" / ")}`);
  }

  for (const [id, meta] of Object.entries(store.known || {})) {
    if (!id.startsWith("skill:") || meta.missing) continue;
    const skill = id.slice(6);
    if (!inWantedRole(ACTIVE_PROFILE?.itemInfo?.[skill])) continue;
    const hit = termScoreDistinct(terms, `${skill} ${meta.description || ""}`);
    // 未归类条目没有角色背书，命中门槛提高一档，否则任何描述都能蹭进来
    const bar = (ACTIVE_PROFILE?.itemInfo?.[skill]?.roles || []).length ? 1.5 : 2.4;
    if (hit.score >= bar) addSkill(skill, hit.score + usageBoost(store, topScenario?.id, skill), `技能描述命中：${hit.hits.slice(0, 3).join(" / ")}`);
  }

  // 覆盖兜底：首要场景的必需能力，即使描述没命中也要补一个成员进来。
  // 不补的话，漏用会恰好发生在最该覆盖的那个场景上（例：报告场景缺写作技能）。
  if (topScenario) {
    for (const role of contractFor(topScenario).required) {
      const members = [
        ...(ACTIVE_PROFILE?.roles?.[role]?.skills || []).map((x) => ({ id: x.id, kind: "skill" })),
        ...(ACTIVE_PROFILE?.roles?.[role]?.packages || []).map((x) => ({ id: x.id, kind: "plugin" })),
      ];
      if (!members.length) continue;
      if (members.some((x) => packages.has(x.id) || skills.has(x.id))) continue;
      const best = members[0];
      const why = `必需能力：${CAPABILITIES[role]?.label || role}`;
      if (best.kind === "skill") addSkill(best.id, 1, why);
      else addPkg(best.id, 1, why);
    }
  }

  if (!intents.length && !packages.size && !skills.size) {
    const firstPkg = (role) => ACTIVE_PROFILE?.roles?.[role]?.packages?.[0]?.id;
    const codey = /代码|文件|函数|报错|bug|test|重构|页面|接口|模块|脚本|数据|csv|json|yaml|python|node|npm|构建|编译|部署|命令行|cli|程序|游戏|网站|应用|app|开发|工具|compile|error/.test(norm(raw));
    if (codey && firstPkg("code-intel")) addPkg(firstPkg("code-intel"), 0.5, "通用代码检查");
    if (raw.length > 12 && firstPkg("task")) addPkg(firstPkg("task"), 0.4, "多步需求跟踪");
  }

  const demands = uniq([
    ...(contractFor(topScenario).required || []),
    ...tagsOf(raw),
  ]);
  const withTags = (list) => list.map((x) => {
    const info = ACTIVE_PROFILE?.itemInfo?.[x.pkg || x.skill];
    return { ...x, id: x.pkg || x.skill, tags: info?.tags || [], roles: info?.roles || [] };
  });
  const pkgList = selectByCoverage(withTags([...packages.values()]), DYNAMIC_LIMITS.packages, demands)
    .map(({ id, tags, roles, ...rest }) => rest);
  const skillList = selectByCoverage(withTags([...skills.values()]), DYNAMIC_LIMITS.skills, demands)
    .map(({ id, tags, roles, ...rest }) => rest);
  const confidence = intents.length ? (intents[0].score >= 2.5 ? "high" : intents[0].score >= 1 ? "medium" : "low") : "low";
  return {
    need: raw,
    terms: terms.slice(0, 40),
    intents,
    packages: pkgList,
    skills: skillList,
    private: privateNeed,
    useMcp,
    confidence,
  };
}

function dynamicScenario(need, analysis, workflow = null) {
  const pkgNames = analysis.packages.map((x) => x.pkg);
  const skillNames = analysis.skills.map((x) => x.skill);
  const intentText = analysis.intents.length
    ? analysis.intents.map((r) => `${r.scenario.title}（${r.hits.slice(0, 3).join(" / ")}）`).join("；")
    : "没有命中固定场景，按技能/插件能力描述选择";
  const pkgText = analysis.packages.length
    ? analysis.packages.map((x) => `${x.pkg}：${x.reasons[0] || "能力匹配"}`).join("；")
    : "没有匹配到额外插件，只保留核心工具";
  const skillText = skillNames.length ? skillNames.join("、") : "没有匹配到额外技能";
  return {
    id: "custom",
    group: "动态",
    title: "动态任务",
    when: need,
    keywords: [],
    plugins: pkgNames,
    brief: `需求：${need}\n识别到：${intentText}\n按需插件：${pkgText}\n按需技能：${skillText}\n${workflow ? `工作流：${workflow.title} — ${workflow.brief}\n` : ""}先复核组合是否覆盖需求；缺什么就明确说明，不要因为自动组合而跳过澄清。`,
    manual: [],
    dynamic: true,
    skillIds: skillNames,
    analysis,
    noAlways: true,
    noWorkflow: analysis.private,
  };
}

function classifyItem(item, scenarios = SCENARIOS) {
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
function isInfraId(id) {
  const base = String(id || "").replace(/^(npm|local|skill):/, "").replace(/^skill:/, "");
  const info = ACTIVE_PROFILE?.itemInfo?.[base];
  if (info) return !!info.infra;
  return Object.values(ACTIVE_PROFILE?.roles || {}).some((r) => r.infra && (r.packages.some((p) => p.id === base) || r.skills.some((s) => s.id === base)));
}

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

function stripSkillPrefix(name) {
  return String(name || "").replace(/^skill:/, "");
}

function readSkillMeta(file) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return null; }
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return null;
  const read = (key) => {
    const line = block[1].split(/\r?\n/).find((l) => l.trimStart().startsWith(key + ":"));
    if (!line) return "";
    return line.slice(line.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "");
  };
  return {
    name: stripSkillPrefix(read("name") || path.basename(path.dirname(file))),
    description: read("description"),
  };
}

function skillRoots() {
  const roots = [
    path.join(agentDir(), "skills"),
    path.join(process.cwd(), ".agents", "skills"),
    path.join(process.cwd(), ".pi", "skills"),
  ];
  // GSD 的技能在 agent/gsd-package-cache/<hash>/skills 下
  try {
    for (const d of fs.readdirSync(path.join(agentDir(), "gsd-package-cache"), { withFileTypes: true })) {
      if (d.isDirectory()) roots.push(path.join(agentDir(), "gsd-package-cache", d.name, "skills"));
    }
  } catch { /* no GSD cache */ }
  // 包自带技能作为 pi.getCommands() 的兜底，只查已知包的一层 skills
  for (const pkg of listInstalledPackages()) {
    roots.push(path.join(agentDir(), "npm", "node_modules", pkg, "skills"));
  }
  return uniq(roots);
}

function discoverFilesystemSkills(items, ensure) {
  for (const root of skillRoots()) {
    let dirs = [];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name)); } catch { continue; }
    for (const dir of dirs) {
      const meta = readSkillMeta(path.join(dir, "SKILL.md"));
      if (!meta?.name) continue;
      const id = "skill:" + meta.name;
      const desc = meta.description || "技能";
      const it = ensure(id, { kind: "skill", pkg: null, label: meta.name, description: desc, text: meta.name + " " + desc });
      it.label = meta.name;
      it.description = desc;
      it.text = [it.text, meta.name, desc].filter(Boolean).join(" ");
      if (!it.skills.includes(meta.name)) it.skills.push(meta.name);
    }
  }
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
      bucket.push(c.source === "skill" ? stripSkillPrefix(c.name) : c.name);
      owner.text += " " + stripSkillPrefix(c.name) + " " + (c.description || "");
      continue;
    }
    if (c.source === "skill") {
      const name = stripSkillPrefix(c.name);
      const it = ensure("skill:" + name, { kind: "skill", pkg: null, label: name, description: c.description || "技能", text: name + " " + (c.description || "") });
      if (!it.skills.includes(name)) it.skills.push(name);
    }
  }

  // 5) 文件系统技能兜底：pi.getCommands() 在 session_start 时可能还没加载技能
  discoverFilesystemSkills(items, ensure);

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
  const changed = [];
  // 分类规则升级：只重算自动归类项，手动 override 永远保留。
  if ((store.classifierVersion || 0) < CLASSIFIER_VERSION) {
    for (const [id, meta] of Object.entries(store.known)) {
      if (!meta.auto || store.overrides[id] || meta.scenario === "infra" || isInfraId(id)) continue;
      const item = items.get(id);
      if (!item) continue;
      const c = classifyItem(item);
      if (c.scenarioId && c.scenarioId !== meta.scenario) {
        changed.push({ id, label: meta.label || id, from: meta.scenario, to: c.scenarioId });
        meta.scenario = c.scenarioId;
        meta.reason = c.reason;
      }
    }
    // 已删除的本地扩展不要永久留在目录里
    for (const id of Object.keys(store.known)) {
      if (id.startsWith("local:") && !items.has(id)) delete store.known[id];
    }
    store.classifierVersion = CLASSIFIER_VERSION;
  }
  for (const [id, item] of items) {
    if (store.overrides[id] === "none") continue;
    if (store.known[id]) {
      const meta = store.known[id];
      meta.missing = false;
      if (item.label && (!meta.label || String(meta.label).startsWith("skill:"))) meta.label = item.label;
      if (item.description && !meta.description) meta.description = item.description;
      continue;
    }
    const c = classifyItem(item);
    const infra = isInfraId(id);
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
  // 不在扫描时把条目标成 missing：一次不完整的枚举（非交互/测试环境）会把整个目录
  // 误判成“已卸载”。可用性由 auditPackages 在装配时实时判断，不靠这张持久表。
  if (changed.length) store.lastReclassified = changed.slice(0, 50);
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

function scenarioSkillIds(store, scenarioId) {
  const roles = SCENARIO_CAPABILITIES[scenarioId] || [];
  const fromProfile = roles.flatMap((role) => (ACTIVE_PROFILE?.roles?.[role]?.skills || []).map((x) => x.id));
  const manual = Object.entries(store.overrides || {})
    .filter(([id, sid]) => id.startsWith("skill:") && sid === scenarioId)
    .map(([id]) => id.slice(6));
  return uniq([...fromProfile, ...manual]);
}

function skillMenuInfo(skills) {
  if (!skills.length) return "0 技能";
  const gsd = skills.filter((s) => /^gsd-/.test(s));
  const rest = skills.filter((s) => !/^gsd-/.test(s));
  const bits = [];
  if (rest.length) bits.push(rest.length <= 3 ? rest.join("、") : `${rest.slice(0, 2).join("、")} 等`);
  if (gsd.length) bits.push(`GSD ${gsd.length}`);
  return `${skills.length} 技能（${bits.join(" + ")}）`;
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
function scenarioPackages(scenario, store) {
  const manual = Object.entries(store.overrides || {})
    .filter(([id, sid]) => id.startsWith("npm:") && sid === scenario.id)
    .map(([id]) => id.slice(4));
  return uniq([...(scenario.plugins || []), ...manual]);
}

function comboPackages(scenario, store, workflow = null) {
  const base = scenarioPackages(scenario, store);
  if (!workflow || scenario.noWorkflow) return base;
  return uniq([...base, ...(workflow.plugins || [])]);
}

function comboSkillIds(scenario, store, workflow = null) {
  const base = scenario.dynamic
    ? (scenario.skillIds || [])
    : scenario.comboIds
      ? uniq([...(scenario.skillIds || []), ...scenario.comboIds.flatMap((id) => scenarioSkillIds(store, id))])
      : scenarioSkillIds(store, scenario.id);
  if (!workflow || scenario.noWorkflow) return uniq(base);
  return uniq([...base, ...(workflow.skills || [])]);
}

// 使用反馈（阶段 D）：只记录"这次装配把谁放进去了"和"用户手动把谁归到哪个场景"，
// 用它给同一场景下的条目加一点分。上限 1.2，永远压不过关键词命中（5 分）。
const USAGE_BOOST_CAP = 1.2;
function usageBoost(store, scenarioId, id) {
  if (!scenarioId) return 0;
  const key = String(id).replace(/^npm:/, "");
  const picked = store?.usage?.[scenarioId]?.[key] || 0;
  const called = store?.itemUse?.[scenarioId]?.[key] || 0;
  const manual = store?.manualAdds?.[scenarioId]?.[key] || 0;
  // 真实调用过的权重最高：被选上但从没调用过，只拿很小的一点分。
  return Math.min(USAGE_BOOST_CAP, 0.5 * Math.log1p(called) + 0.1 * Math.log1p(picked) + (manual ? 0.8 : 0));
}

// 把一次真实工具调用记到"当前装配场景 × 所属包"名下。
function recordToolUse(store, scenarioId, toolName, allTools = []) {
  if (!scenarioId || !toolName) return null;
  const tool = allTools.find((t) => t.name === toolName);
  const p = String(tool?.sourceInfo?.path || "");
  const hit = /node_modules[\/](?:@[^\/]+[\/])?([^\/]+)/.exec(p);
  const item = hit ? hit[1] : toolName;
  store.itemUse = store.itemUse || {};
  const bucket = store.itemUse[scenarioId] = store.itemUse[scenarioId] || {};
  bucket[item] = (bucket[item] || 0) + 1;
  return item;
}

function recordUsage(store, scenario, workflow = null) {
  if (!store || !scenario) return;
  const sid = scenario.comboIds?.length ? scenario.comboIds.join("+") : scenario.id;
  store.usage = store.usage || {};
  const bucket = store.usage[sid] = store.usage[sid] || {};
  for (const raw of [...comboPackages(scenario, store, workflow), ...comboSkillIds(scenario, store, workflow)]) {
    const key = String(raw).replace(/^npm:/, "");
    bucket[key] = (bucket[key] || 0) + 1;
  }
}

// 多选：场景/工作流可以用 + 组合（/function debug+process）。合并时只做并集与去重，不重新打分。
function comboScenarios(scenarios) {
  const list = scenarios.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  return {
    id: list.map((s) => s.id).join("+"),
    comboIds: list.map((s) => s.id),
    group: "组合",
    title: list.map((s) => s.title).join(" + "),
    when: list.map((s) => s.when).filter(Boolean).join("；"),
    keywords: [],
    brief: list.map((s) => `${s.title}：${s.brief}`).join("\n"),
    plugins: uniq(list.flatMap((s) => s.plugins || [])),
    skillIds: uniq(list.flatMap((s) => s.skillIds || [])),
    manual: uniq(list.flatMap((s) => s.manual || [])),
  };
}

function comboWorkflows(workflows) {
  const list = workflows.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  return {
    id: list.map((w) => w.id).join("+"),
    title: list.map((w) => w.title).join(" + "),
    when: list.map((w) => w.when).filter(Boolean).join("；"),
    brief: list.map((w) => w.brief).filter(Boolean).join(" "),
    keywords: [],
    steps: uniq(list.flatMap((w) => w.steps || [])),
    checkpoint: uniq(list.map((w) => w.checkpoint).filter(Boolean)).join("；"),
    doneWhen: uniq(list.map((w) => w.doneWhen).filter(Boolean)).join("；"),
    manual: uniq(list.flatMap((w) => w.manual || [])),
  };
}

// 场景能力契约：required 缺一项就是“漏用”，装配前必须明确报出来；
// forbidden 出现即算噪声（回归测试会断言）。取值可以是能力角色 id，
// 也可以是具体条目 id（skill:xxx / npm:xxx）。
const SCENARIO_CONTRACTS = {
  article: { required: ["writing"], optional: ["web", "memory"], forbidden: ["code-intel"] },
  report: { required: ["web", "writing"], optional: ["data", "docs", "memory"], forbidden: [] },
  presentation: { required: ["slides"], optional: ["design", "writing", "web"], forbidden: [] },
  docs: { required: ["docs"], optional: ["writing", "repo-wiki", "memory"], forbidden: ["slides"] },
  docx: { required: ["docx"], optional: ["writing", "docs"], forbidden: ["code-intel", "slides"] },
  webpage: { required: ["design"], optional: ["browser", "writing", "web"], forbidden: ["stock", "script"] },
  webapp: { required: ["design", "code-intel"], optional: ["browser", "task", "plan-review", "web"], forbidden: [] },
  mobile: { required: ["design", "code-intel"], optional: ["browser", "task"], forbidden: [] },
  game: { required: ["code-intel"], optional: ["design", "browser", "testing"], forbidden: [] },
  design: { required: ["design"], optional: ["slides", "browser", "writing"], forbidden: ["code-intel"] },
  data: { required: ["data"], optional: ["context", "web", "docs"], forbidden: [] },
  api: { required: ["code-intel"], optional: ["testing", "docs", "plan-review"], forbidden: [] },
  automation: { required: ["automation"], optional: ["web", "browser", "code-intel"], forbidden: [] },
  integration: { required: ["mcp"], optional: ["web"], forbidden: [] },
  plugin: { required: ["code-intel"], optional: ["testing", "docs", "plan-review", "orchestration"], forbidden: [] },
  process: { required: ["process"], optional: ["plan-review", "task", "docs"], forbidden: [] },
  maintain: { required: ["code-intel"], optional: ["testing", "simplify", "context", "plan-review"], forbidden: [] },
  localization: { required: ["i18n"], optional: ["writing", "web"], forbidden: [] },
  social: { required: ["writing"], optional: ["design", "web", "memory"], forbidden: ["code-intel"] },
  novel: { required: ["writing"], optional: ["memory"], forbidden: ["code-intel"] },
  video: { required: ["writing"], optional: ["slides", "memory"], forbidden: ["code-intel"] },
  image: { required: ["design"], optional: ["vision"], forbidden: ["code-intel"] },
  course: { required: ["slides"], optional: ["writing", "docs", "memory"], forbidden: [] },
  resume: { required: ["writing"], optional: ["docs", "design"], forbidden: [] },
  event: { required: [], optional: ["writing", "web", "memory", "task"], forbidden: ["code-intel"] },
  commerce: { required: ["design"], optional: ["web", "data", "browser"], forbidden: ["code-intel"] },
  dashboard: { required: ["data"], optional: ["design", "web", "code-intel"], forbidden: [] },
  tool: { required: ["code-intel"], optional: ["testing", "automation"], forbidden: [] },
  chatbot: { required: ["code-intel"], optional: ["web", "mcp", "memory"], forbidden: [] },
  email: { required: ["writing"], optional: ["task", "memory"], forbidden: ["code-intel"] },
  music: { required: ["writing"], optional: ["memory"], forbidden: ["code-intel"] },
  spreadsheet: { required: ["data"], optional: ["automation", "code-intel"], forbidden: [] },
  legal: { required: ["writing"], optional: ["docs", "memory"], forbidden: ["code-intel"] },
  general: { required: [], optional: ["writing", "web", "docs", "memory", "task"], forbidden: [] },
};

function contractFor(scenario) {
  const ids = scenario?.comboIds?.length ? scenario.comboIds : [scenario?.id];
  const list = ids.map((id) => SCENARIO_CONTRACTS[id]).filter(Boolean);
  if (!list.length) return { required: [], optional: [], forbidden: [] };
  if (list.length === 1) return list[0];
  const first = list[0];
  return {
    required: uniq(list.flatMap((c) => c.required)),
    optional: uniq(list.flatMap((c) => c.optional)),
    forbidden: first.forbidden.filter((role) => list.every((c) => c.forbidden.includes(role))),
  };
}

/**
 * 覆盖审计：区分“根本没装”（not-installed）与“装了但没进本次组合”（not-selected），
 * 并检查 forbidden 能力是否误入。这是“不漏用”唯一可验收的口径。
 */
function auditCoverage(scenario, store, workflow = null) {
  const contract = contractFor(scenario);
  const strip = (id) => String(id).replace(/^npm:/, "").replace(/^skill:/, "");
  const included = new Set([
    ...comboPackages(scenario, store, workflow).map(strip),
    ...comboSkillIds(scenario, store, workflow).map(strip),
  ]);
  const roleMembers = (role) => uniq([
    ...(ACTIVE_PROFILE?.roles?.[role]?.packages || []).map((x) => strip(x.id)),
    ...(ACTIVE_PROFILE?.roles?.[role]?.skills || []).map((x) => strip(x.id)),
  ]);
  const label = (role) => CAPABILITIES[role]?.label || role;
  const isId = (need) => need.includes(":");
  const membersOf = (need) => (isId(need) ? [strip(need)] : roleMembers(need));
  const missing = [];
  const present = [];
  for (const need of contract.required) {
    const installed = membersOf(need).filter(Boolean);
    if (installed.some((id) => included.has(id))) {
      present.push(need);
      continue;
    }
    if (!installed.length) {
      missing.push({ need, kind: "not-installed", detail: `缺「${label(need)}」：当前没有可用条目，装配也补不出来` });
    } else {
      missing.push({ need, kind: "not-selected", detail: `有「${label(need)}」（${installed.slice(0, 2).join("、")}）但没进本次组合` });
    }
  }
  const forbiddenHit = contract.forbidden.filter((role) => membersOf(role).some((id) => included.has(id)));
  return { ok: missing.length === 0 && forbiddenHit.length === 0, required: contract.required, present, missing, forbiddenHit };
}

/**
 * 能力缺口：需求提到、但本机没有任何条目能做的交付形态。
 * 两个来源：① NEED_CAPABILITIES 命中的需求词；② 场景契约 required 但 not-installed 的角色。
 * 只识别缺口、不擅自找方案——找不找由用户在装配前决定（是 → find-skill）。
 */
function capabilityGaps(scenario, store = {}, workflow = null) {
  const raw = scenario?.dynamic ? String(scenario.when || "") : `${scenario?.title || ""} ${scenario?.when || ""}`;
  const t = norm(raw);
  const info = ACTIVE_PROFILE?.itemInfo || {};
  const hasItem = (re, exclude) => Object.entries(info).some(([id, meta]) => {
    const text = norm(`${id} ${meta?.description || ""} ${(meta?.tags || []).join(" ")}`);
    return re.test(text) && !(exclude && exclude.test(text));
  });
  const gaps = [];
  for (const cap of NEED_CAPABILITIES) {
    if (!cap.need.test(t)) continue;
    if (hasItem(cap.item, cap.exclude)) continue;
    if (gaps.some((g) => g.id === cap.id)) continue;
    gaps.push({ id: cap.id, label: cap.label, hint: cap.hint, source: "need" });
  }
  for (const miss of auditCoverage(scenario, store, workflow).missing) {
    if (miss.kind !== "not-installed") continue;
    if (gaps.some((g) => g.id === miss.need)) continue;
    gaps.push({ id: miss.need, label: CAPABILITIES[miss.need]?.label || miss.need, hint: "场景必需能力", source: "contract" });
  }
  return gaps.slice(0, 3);
}

// 找技能的入口：用户装的是哪个就用哪个（skill:skill-finder / skill:find-skill-skillhub）。
function findSkillCommandName(commands = []) {
  const skills = commands.filter((c) => c?.source === "skill" && c.name);
  const hit = skills.find((c) => /(?:^|:)skill-finder$/i.test(c.name))
    || skills.find((c) => /skill-finder|find-skill/i.test(c.name));
  return hit ? hit.name : null;
}

// 交给 find-skill 的请求：先说清缺什么，再要求“先确认本机没有、给候选、等确认再装”。
function skillSearchMessage(gaps, need = "") {
  const labels = gaps.map((g) => `${g.label}（${g.hint}）`).join("、");
  return [
    need ? `需求：${need}` : "",
    `缺的能力：${labels}`,
    "先确认本机现有技能/插件/命令行是否真的没有；没有就给出 2-3 个候选（各自覆盖哪部分、怎么装），等我确认再装。",
    "找不到可用技能时直接说明缺口和替代方案，不要假装能做到。",
  ].filter(Boolean).join("\n");
}

// 装配后要问清的事：默认三问（交付物 / 验收 / 边界），流程类场景再加一问。
function followupQuestions(scenario, workflow = null) {
  const ids = [scenario?.id || "", ...(scenario?.comboIds || [])].join("+");
  const qs = [
    "交付物：这次要交的是什么形态——改动、文件、文档，还是一个结论？",
    `验收：什么算做完${workflow?.doneWhen ? `（按「${workflow.title}」的完成标准：${workflow.doneWhen}）` : ""}？谁来验收？`,
    "边界：这次明确不做什么，避免范围扩大？",
  ];
  if (/process/.test(ids)) qs.push("流程：这条流程现在是谁在跑，每步大概花多久、产出什么？");
  if (/plugin|webapp|api|maintain/.test(ids)) qs.push("改动面：只改扩展/插件本身，还是要一并改设置、提示词或文档？");
  return qs.slice(0, 4);
}

const WORKFLOW_ALIASES = { prototype: "outline", iterate: "review-gate" };

function normalizeWorkflowId(id) {
  return WORKFLOW_ALIASES[id] || id;
}

function workflowById(id) {
  const normalized = normalizeWorkflowId(id);
  return WORKFLOWS.find((w) => w.id === normalized) || null;
}

function recommendWorkflow(scenario) {
  if (!scenario) return "direct";
  if (scenario.id === "maintain") return "debug";
  if (scenario.id === "report") return "research";
  if (scenario.id === "process") return "process-design";
  if (["webpage", "game", "design", "mobile", "image", "dashboard", "commerce"].includes(scenario.id)) return "outline";
  if (["webapp", "api", "plugin", "article", "presentation", "docs", "automation", "integration", "localization", "social", "novel", "video", "course", "resume", "event", "chatbot", "email", "music", "legal", "tool"].includes(scenario.id)) return "outline";
  return "direct";
}

function workflowOptions(recommendedId = null) {
  const ordered = recommendedId
    ? [
        ...WORKFLOWS.filter((w) => w.id === recommendedId),
        ...WORKFLOWS.filter((w) => w.id !== recommendedId),
      ]
    : WORKFLOWS;
  return ordered.map((w) => {
    const mark = w.id === recommendedId ? "★ 推荐 · " : "";
    const pkgN = (w.plugins || []).length;
    const skillN = (w.skills || []).length;
    const skillNames = (w.skills || []).slice(0, 2).join("、");
    const skillInfo = skillN ? `（${skillNames}${skillN > 2 ? " 等" : ""}）` : "";
    const bundle = pkgN || skillN ? ` · ${pkgN} 插件 / ${skillN} 技能${skillInfo}` : " · 仅核心工具";
    return `${w.id} · ${w.title} — ${mark}${w.picker || w.when}${bundle}`;
  });
}

function workflowOnlyScenario(workflow) {
  return {
    id: "workflow",
    group: "工作流",
    title: `仅工作流：${workflow.title}`,
    when: workflow.when,
    brief: workflow.brief,
    plugins: [...(workflow.plugins || [])],
    skillIds: [...(workflow.skills || [])],
    manual: [...(workflow.manual || [])],
    workflowOnly: true,
  };
}

function coreToolNames(pi) {
  const all = pi.getAllTools().map((t) => t.name);
  return CORE_TOOLS.filter((n) => all.includes(n));
}

function toolsForScenario(pi, scenario, store, workflow = null) {
  const pkgs = comboPackages(scenario, store, workflow);
  return pi.getAllTools().filter((t) => pkgs.some((p) => matchesPkg(t.sourceInfo, p))).map((t) => t.name);
}

function commandsForPkg(pi, pkg) {
  return pi.getCommands().filter((c) => c.source === "extension" && matchesPkg(c.sourceInfo, pkg));
}

function summarizeNames(names, max = 8) {
  if (!names.length) return "";
  if (names.length <= max) return names.join(", ");
  return names.slice(0, max).join(", ") + ` …（共 ${names.length} 个）`;
}

function summarizeSkills(skills, max = 8) {
  if (!skills.length) return "";
  const gsd = skills.filter((s) => /^gsd-/.test(s));
  const rest = skills.filter((s) => !/^gsd-/.test(s));
  const bits = [];
  if (rest.length) bits.push(summarizeNames(rest, max));
  if (gsd.length) bits.push(`GSD 阶段技能 ${gsd.length} 个（/gsd 查看）`);
  return bits.join("；");
}

function describePlugin(pi, pkg, manual = "") {
  const info = ACTIVE_PROFILE?.itemInfo?.[pkg] || {};
  const tools = pi.getAllTools().filter((t) => matchesPkg(t.sourceInfo, pkg)).map((t) => t.name);
  const cmds = commandsForPkg(pi, pkg).map((c) => "/" + c.name);
  const skills = pi.getCommands().filter((c) => c.source === "skill" && matchesPkg(c.sourceInfo, pkg)).map((c) => c.name);
  const bits = [info.description || "插件"];
  if (tools.length) bits.push("工具 " + tools.join(", "));
  if (cmds.length) bits.push("命令 " + cmds.slice(0, 6).join(", "));
  if (skills.length) bits.push("技能 " + summarizeSkills(skills));
  if (manual) bits.push("手动 " + manual);
  return bits.join(" · ");
}

function buildProposal(pi, scenario, store, workflow = null) {
  const lines = [];
  const comboTitle = workflow ? `${workflow.title} × ${scenario.title}` : scenario.title;
  lines.push(`## 装配：${comboTitle}`);
  if (workflow) {
    lines.push(`**工作流**：${workflow.when}`);
    lines.push("- 流程：");
    (workflow.steps || []).forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
    if (workflow.checkpoint) lines.push(`- 检查点：${workflow.checkpoint}`);
    if (workflow.doneWhen) lines.push(`- 完成标准：${workflow.doneWhen}`);
  }
  if (scenario.id === "process" || workflow?.id === "process-design") {
    lines.push("");
    lines.push("**分配方法（先拆解再分配）**");
    ALLOCATION_METHOD.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push("");
  }
  lines.push("**装配后会先问你**");
  followupQuestions(scenario, workflow).forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  lines.push("");
  if (scenario.dynamic) {
    lines.push(`**需求**：${scenario.when}`);
    lines.push("**需求分析**");
    if (scenario.analysis?.intents?.length) {
      for (const r of scenario.analysis.intents) {
        lines.push(`- 任务信号：${r.scenario.title}（命中：${r.hits.slice(0, 4).join(" / ")}）`);
      }
    } else {
      lines.push("- 没有命中固定任务，按技能/插件能力描述组合。");
    }
    lines.push(`- 置信度：${scenario.analysis?.confidence || "low"}（组合仍可确认/取消）`);
  } else {
    lines.push(`**任务**：${scenario.when}`);
  }
  lines.push("");
  const gaps = capabilityGaps(scenario, store, workflow);
  if (gaps.length) {
    lines.push("**能力缺口（本机没有）**");
    for (const g of gaps) {
      lines.push(`- ⚠️ ${g.label} — ${g.hint}${g.source === "contract" ? "（场景必需）" : "（需求提到）"}：没有可用条目`);
    }
    lines.push("- 装配前会问你：要不要用 find-skill 去找这些能力（是 / 否）");
    lines.push("");
  }
  const coverage = auditCoverage(scenario, store, workflow);
  if (coverage.required.length || coverage.forbiddenHit.length) {
    lines.push("**覆盖检查（漏用检查）**");
    if (!coverage.missing.length) lines.push(`- 必需能力已覆盖：${coverage.required.join("、") || "（无硬要求）"}`);
    for (const m of coverage.missing) lines.push(`- ⚠️ ${m.detail}`);
    if (coverage.forbiddenHit.length) lines.push(`- ⚠️ 不该出现的：${coverage.forbiddenHit.join("、")}`);
    lines.push("");
  }
  lines.push("**将启用的插件与功能**");
  const pkgs = comboPackages(scenario, store, workflow);
  if (!pkgs.length) lines.push("- 不启用额外插件（只保留核心工具）");
  for (const pkg of pkgs) {
    const fromWorkflow = workflow?.plugins?.includes(pkg) && !(scenario.plugins || []).includes(pkg);
    const reason = scenario.dynamic ? scenario.analysis?.packages?.find((x) => x.pkg === pkg)?.reasons?.[0] : "";
    lines.push(`- \`${pkg}\`${fromWorkflow ? "（工作流套餐）" : ""} — ${describePlugin(pi, pkg)}${reason ? `（${reason}）` : ""}`);
  }
  const skills = comboSkillIds(scenario, store, workflow);
  if (scenario.dynamic) {
    if (skills.length) {
      lines.push(`**按需技能 ${skills.length} 个**`);
      for (const skill of skills.slice(0, 8)) {
        const desc = String(store.known?.[`skill:${skill}`]?.description || "已安装技能").replace(/\s+/g, " ").slice(0, 140);
        lines.push(`- \`skill:${skill}\` — ${desc}`);
      }
    } else {
      lines.push("- 没有匹配到额外技能；技能仍可随时通过 /skill: 调用。");
    }
  } else if (skills.length) lines.push(`- 自动归入技能 ${skills.length} 个：${summarizeSkills(skills)}（随会话自动加载）`);
  lines.push("- 核心工具始终保留：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。");
  const manual = uniq([...(scenario.manual || [])]);
  if (manual.length) {
    lines.push("");
    lines.push("**装配后仍需手动做**");
    for (const m of manual) lines.push("- " + m);
  }
  lines.push("");
  lines.push("**不会自动执行**：确认只改变工具与提示，需求仍需你按 Enter 或另行发送。");
  lines.push("**装配含义**：启用上述工具、停用其他插件的可选工具、把工作流与任务流程一起注入系统提示。插件代码常驻，不会真正卸载。");
  return lines.join("\n");
}

// 插件可用性诊断：ok = 有工具且已启用；warn = 能跑但有已知限制；
// inactive = 已注册但全局停用/未完成设置；absent = 未安装/未注册。
function auditPackages(pi, scenario, store, workflow = null) {
  const all = pi.getAllTools();
  const active = new Set(pi.getActiveTools());
  const cmds = pi.getCommands();
  const rows = [];
  for (const pkg of comboPackages(scenario, store, workflow)) {
    const tools = all.filter((t) => matchesPkg(t.sourceInfo, pkg)).map((t) => t.name);
    const skillN = cmds.filter((c) => c.source === "skill" && matchesPkg(c.sourceInfo, pkg)).length;
    const cmdN = cmds.filter((c) => c.source === "extension" && matchesPkg(c.sourceInfo, pkg)).length;
    let state = "ok";
    let detail = tools.length ? tools.slice(0, 8).join(", ") : `${cmdN} 个命令 / ${skillN} 个技能`;
    if (!tools.length && !skillN && !cmdN) {
      state = "absent";
      detail = "未安装或未注册任何工具/命令/技能";
    } else if (tools.length && !tools.some((t) => active.has(t))) {
      state = "inactive";
      detail = "工具已注册但已停用：" + tools.slice(0, 6).join(", ");
    }


    rows.push({ pkg, state, detail });
  }
  return rows;
}

function applyScenario(pi, ctx, scenario, store, baseline, workflow = null) {
  const all = pi.getAllTools();
  const active = pi.getActiveTools();
  const optional = new Set(all.filter((t) => isOptionalSource(t.sourceInfo)).map((t) => t.name));
  const wanted = new Set(toolsForScenario(pi, scenario, store, workflow));
  const keep = active.filter((n) => !optional.has(n));
  const core = coreToolNames(pi);
  const next = uniq([...keep, ...core, ...wanted]);
  const disabled = active.filter((n) => optional.has(n) && !wanted.has(n));
  pi.setActiveTools(next);
  // 说清楚哪些插件其实用不了，不再静默
  const bad = auditPackages(pi, scenario, store, workflow).filter((r) => r.state !== "ok");
  if (bad.length) {
    ctx?.ui?.notify?.(
      "场景中以下插件需要留意：\n" + bad.map((r) => `- ${r.pkg}（${r.state}）：${r.detail}`).join("\n"),
      "warning",
    );
  }
  recordUsage(store, scenario, workflow);
  saveStore(store);
  const coverage = auditCoverage(scenario, store, workflow);
  if (coverage.missing.length) {
    ctx?.ui?.notify?.("漏用检查：\n" + coverage.missing.map((m) => `- ${m.detail}`).join("\n"), "warning");
  }
  return { next, enabled: [...wanted].filter((n) => !active.includes(n)), disabled, bad, coverage };
}

// ---------------------------------------------------------------------------
// 菜单
// ---------------------------------------------------------------------------
function buildCatalog(pi, store) {
  const totalSkills = Object.entries(store.known).filter(([id, meta]) => id.startsWith("skill:") && !meta.missing).length;
  const lines = [`## /function 场景菜单（${SCENARIOS.length} 个组合 · ${totalSkills} 个技能）`];
  lines.push("");
  lines.push("## 第 1 步：工作流（怎么执行）");
  for (const w of WORKFLOWS) {
    const bundle = [
      ...(w.plugins || []).map((p) => `\`${p}\``),
      ...(w.skills || []).slice(0, 4).map((s) => `\`skill:${s}\``),
    ];
    lines.push(`- **${w.id}** · ${w.title} — ${w.when}`);
    lines.push(`  - 流程：${(w.steps || []).join(" → ")}`);
    lines.push(`  - 套餐：${bundle.length ? bundle.join("、") : "仅核心工具"}`);
  }
  lines.push("");
  lines.push("## 第 2 步：任务场景（做什么）");
  const groups = uniq(SCENARIOS.map((s) => s.group));
  for (const g of groups) {
    lines.push("");
    lines.push(`### ${g}`);
    for (const s of SCENARIOS.filter((x) => x.group === g)) {
      lines.push(`**${s.id}** · ${s.title}`);
      lines.push(`- 何时用：${s.when}`);
      const pkgs = s.plugins || [];
      if (pkgs.length) {
        for (const pkg of pkgs) lines.push(`- \`${pkg}\` — ${describePlugin(pi, pkg)}`);
      } else {
        lines.push("- 不需要额外插件");
      }
      const skills = scenarioSkillIds(store, s.id);
      if (skills.length) lines.push(`- 技能 ${skills.length} 个：${summarizeSkills(skills)}（随会话自动加载）`);
    }
  }
  const unclassified = Object.entries(store.known).filter(([, m]) => !m.scenario && !m.missing);
  if (unclassified.length) {
    lines.push("");
    lines.push("### 未分类（用 /function assign <名称> <场景id> 指定）");
    for (const [id, m] of unclassified) lines.push(`- ${id}（${m.reason || "无命中"}）`);
  }
  lines.push("");
  lines.push("用法：`/function` 先选子功能；`/function workflow` 只选工作流；`/function <需求>` 自动识别；`/function profile` 查看画像；`/function scan` 重扫；`/function off` 还原。");
  return lines.join("\n");
}

function buildProfileReport(store) {
  const profile = ensureProfile(store) || buildProfile(store);
  const active = Object.entries(store.known).filter(([, m]) => m && !m.missing).length;
  const lines = [
    `## 能力画像（v${PROFILE_VERSION} · ${profile.fingerprint}）`,
    `- 条目：${active} 个；已归类 ${active - profile.unassigned.length} 个，未归类 ${profile.unassigned.length} 个`,
    `- 文件：\`${profilePath()}\``,
    "",
    "### 角色 → 插件 / 技能",
  ];
  for (const role of Object.values(profile.roles)) {
    const pkgs = role.packages.map((p) => `${p.id}(${p.score})`);
    const skills = role.skills.slice(0, 8).map((s) => `skill:${s.id}`);
    if (!pkgs.length && !skills.length) continue;
    lines.push(`- **${role.label}** \`${role.id}\`${role.infra ? "（基础设施，不进场景套餐）" : ""}`);
    if (pkgs.length) lines.push(`  - 插件：${pkgs.join("、")}`);
    if (skills.length) lines.push(`  - 技能：${skills.join("、")}${role.skills.length > 8 ? " …" : ""}`);
  }
  if (profile.unassigned.length) {
    lines.push("", "### 未归类");
    lines.push(profile.unassigned.map((id) => `- ${id}`).join("\n"));
  }
  lines.push("", "规则：包名 5 / 工具或命令 3 / 技能名 5 / 描述 1；每个条目最多取 3 个包角色或 2 个技能角色；角色级 deny 过滤误匹配。");
  lines.push("调整：`/function scan` 重建；手动绑定用 `/function assign <名称> <场景id>`。");
  return lines.join("\n");
}

export function menuOptions(store, scenarios = SCENARIOS) {
  return scenarios.map((s) => {
    const count = scenarioPackages(s, store).length;
    const skills = scenarioSkillIds(store, s.id);
    const pluginBit = count ? `${count} 个插件` : "无需插件";
    return `${s.id} · ${s.title} — ${pluginBit} · ${skillMenuInfo(skills)}`;
  });
}

// ---------------------------------------------------------------------------
// 扩展入口
// ---------------------------------------------------------------------------
export default function functionMenu(pi) {
  let store = loadStore();
  ensureProfile(store);
  let activeScenario = null;
  let activeWorkflow = null;
  let baseline = [];
  let baselineCaptured = false;
  const captureBaseline = () => {
    if (baselineCaptured) return;
    baseline = uniq([...pi.getActiveTools(), ...coreToolNames(pi)]);
    baselineCaptured = baseline.length > 0;
  };

  let watcher = null;
  let watchTimer = null;
  let sessionCtx = null;

  const scan = (notify) => {
    const items = discoverItems(pi);
    // 发现结果明显少于已知目录：几乎总是枚举不完整（非交互会话 / 测试桩），
    // 而不是“全都卸载了”。此时不碰目录、不写盘，避免把整表删成空。
    const knownCount = Object.keys(store.known || {}).length;
    if (knownCount && items.size < Math.max(5, knownCount * 0.3)) {
      return [];
    }
    const added = reconcile(store, items);
    saveStore(store);
    ensureProfile(store, true);
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

  const announceProposal = (scenario, reason, workflow) => {
    const head = reason ? `匹配依据：${reason}\n\n` : "";
    pi.sendMessage({
      customType: "function-proposal",
      content: head + buildProposal(pi, scenario, store, workflow),
      display: true,
    });
  };

  // 多选：一次列全部选项，用户一次输入编号（逗号分隔），不再逐个追问"要不要再叠加"。
  const pickManyFrom = async (ctx, title, items, format, limit = 3) => {
    if (!items.length) return [];
    const lines = items.map((item, i) => `${i + 1}. ${format(item)}`);
    pi.sendMessage({
      customType: "function-picker",
      content: (() => {
        const NL = String.fromCharCode(10);
        return `**${title}**（可多选，最多 ${limit} 个）${NL}${lines.join(NL)}${NL}${NL}输入编号，逗号分隔（如 1,3）；也可以直接输 id。直接回车取消。`;
      })(),
      display: true,
    });
    const raw = await ctx.ui.input(title, "例如 1,3");
    if (!raw) return [];
    const tokens = String(raw).split(/[,，、+\s]+/).filter(Boolean);
    const picked = [];
    for (const token of tokens) {
      const num = Number(token);
      const item = Number.isInteger(num) && num >= 1 && num <= items.length
        ? items[num - 1]
        : items.find((it) => it.id === token);
      if (item && !picked.includes(item)) picked.push(item);
      if (picked.length >= limit) break;
    }
    return picked;
  };

  const orderWorkflows = (recommendedId = null) => {
    const recommended = recommendedId ? workflowById(recommendedId) : null;
    return recommended ? [recommended, ...WORKFLOWS.filter((w) => w.id !== recommended.id)] : WORKFLOWS;
  };

  const orderScenarios = (ranked = []) => (ranked.length
    ? [...ranked.map((r) => r.scenario), ...SCENARIOS.filter((s) => !ranked.some((r) => r.scenario.id === s.id))]
    : SCENARIOS);

  const formatScenario = (scenario, ranked = []) => {
    const hit = ranked.find((r) => r.scenario.id === scenario.id);
    return `${scenario.id} · ${scenario.title}${hit ? `  ← 命中 ${hit.hits.slice(0, 2).join("/") || hit.scenario.id}` : ""}`;
  };


  const confirmScenario = async (ctx, scenario, reason, workflow) => {
    announceProposal(scenario, reason, workflow);
    const pkgs = comboPackages(scenario, store, workflow);
    const list = pkgs.length ? pkgs.join("、") : "无额外插件";
    const cov = auditCoverage(scenario, store, workflow);
    const coverageLines = [
      ...cov.missing.map((m) => `⚠️ ${m.detail}`),
      ...(cov.forbiddenHit.length ? [`⚠️ 不该出现的：${cov.forbiddenHit.join("、")}`] : []),
    ];
    const title = workflow ? `${workflow.title} × ${scenario.title}` : scenario.title;
    return ctx.ui.confirm(
      `装配「${title}」？`,
      `工作流：${workflow ? workflow.title : "直接执行"}\n任务：${scenario.title}\n将启用：${list}\n${coverageLines.join("\n")}${coverageLines.length ? "\n" : ""}确认后只启用工具并注入流程提示，不会自动执行任何需求。`,
    );
  };

  // 缺能力时先问用户：是 = 用 find-skill 去找，否 = 跳过（并告诉模型不要假装能做）。
  const askMissingCapabilities = async (ctx, gaps) => {
    const picked = [];
    if (!gaps.length) return picked;
    for (const gap of gaps) {
      const yes = await ctx.ui.confirm(
        `本机没有「${gap.label}」能力，要去找吗？`,
        `缺口：${gap.label} — ${gap.hint}\n当前插件/技能里没有能做的条目。\n\n是：用 find-skill 搜索可安装/可用的技能，先给候选再装\n否：跳过，继续用手头能力（这部分可能做不了）`,
      );
      if (yes) picked.push(gap);
    }
    return picked;
  };

  // 把“找能力”的请求交给 find-skill 技能；返回是否已发起。
  const dispatchSkillSearch = (ctx, scenario, wanted, needText) => {
    if (!wanted.length) return false;
    scenario.skillGaps = uniq([...(scenario.skillGaps || []), ...wanted.map((g) => g.label)]);
    const cmdName = findSkillCommandName(pi.getCommands?.() || []);
    if (cmdName) scenario.skillIds = uniq([...(scenario.skillIds || []), cmdName.replace(/^skill:/, "")]);
    const text = skillSearchMessage(wanted, needText);
    const msg = cmdName ? `/${cmdName} ${text}` : text;
    try {
      pi.sendUserMessage(msg, { expandPromptTemplates: !!cmdName });
      ctx.ui.notify(`已把「${wanted.map((g) => g.label).join("、")}」交给 find-skill 去找（安装前会让你确认）`, "info");
      return true;
    } catch {
      ctx.ui.setEditorText?.(msg);
      ctx.ui.notify("已把找技能的请求放进输入框，按 Enter 开始", "info");
      return false;
    }
  };

  const runAssemble = async (ctx) => {
    const workflows = await pickManyFrom(ctx, "第 1 步：选工作流（怎么执行）", orderWorkflows(), (w) => `${w.id} · ${w.title}
   ${w.picker || w.when}`);
    if (!workflows.length) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
    const workflow = comboWorkflows(workflows);
    const scenarios = await pickManyFrom(ctx, "第 2 步：选任务场景（做什么）", orderScenarios(), (s) => formatScenario(s));
    if (!scenarios.length) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
    const scenario = comboScenarios(scenarios);
    const reason = "菜单多选";
    const ok = await confirmScenario(ctx, scenario, reason, workflow);
    if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
    const gaps = capabilityGaps(scenario, store, workflow);
    const wanted = await askMissingCapabilities(ctx, gaps);
    const declined = gaps.filter((g) => !wanted.some((w) => w.id === g.id));
    if (declined.length) scenario.declinedGaps = declined.map((g) => g.label);
    const res = applyScenario(pi, ctx, scenario, store, baseline, workflow);
    activeScenario = scenario;
    activeWorkflow = workflow;
    pi.appendEntry("function-scenario", { id: scenario.id, workflow: workflow?.id || null, at: nowIso(), tools: res.next });
    dispatchSkillSearch(ctx, scenario, wanted, `${scenario.title} ${scenario.when || ""}`);
    ctx.ui.notify(
      `已装配「${workflow ? `${workflow.title} × ` : ""}${scenario.title}」：启用 ${res.enabled.length} 个工具，停用 ${res.disabled.length} 个可选工具`,
      "info",
    );
  };

  const FUNCTION_SUBCOMMANDS = [
    { id: "assemble", label: "场景装配 — 工作流 × 应用场景" },
    { id: "workflow", label: "仅选工作流 — 只选执行方式，不绑定场景" },
    { id: "profile", label: "能力画像 — 查看插件/技能的自动归类" },
    { id: "scan", label: "重新扫描 — 重建能力画像" },
    { id: "status", label: "当前装配 — 查看已启用的组合" },
    { id: "stats", label: "分配统计 — 查看使用反馈与加分" },
    { id: "off", label: "还原工具集 — 恢复默认工具" },
    { id: "assign", label: "手动归类 — 指定插件/技能的归属" },
  ];

  const pickSubcommand = async (ctx) => {
    const options = FUNCTION_SUBCOMMANDS.map((s) => `${s.id} · ${s.label}`);
    const sel = await ctx.ui.select("Pi-function 子功能", options);
    if (!sel) return null;
    return FUNCTION_SUBCOMMANDS.find((s) => sel.startsWith(`${s.id} ·`))?.id || null;
  };

  const functionCommand = {
    description: "Pi-function：/function 用工作流 × 场景菜单；/function workflow 只选工作流；/function profile 查看能力画像；带需求文本时动态分析并组合插件/技能",
    getArgumentCompletions: (prefix) => {
      const desc = {
        assemble: "场景装配 — 工作流 × 应用场景",
        workflow: "仅选工作流 — 不绑定场景",
        profile: "查看能力画像",
        scan: "重新扫描插件/技能",
        status: "查看当前装配",
        off: "还原工具集",
        assign: "手动归类插件/技能",
      };
      return ["assemble", ...FUNCTION_SUBCOMMANDS.map((s) => s.id)]
        .filter((v, i, a) => a.indexOf(v) === i && v.startsWith(prefix || ""))
        .map((v) => ({ value: v, label: v, description: desc[v] || "" }));
    },
    handler: async (rawArgs, ctx) => {
      captureBaseline();
      let args = String(rawArgs || "").trim().replace(/^["'“”]|["'“”]$/g, "");

      if (!args) {
        scan(false);
        if (!requireUI(ctx)) return;
        const picked = await pickSubcommand(ctx);
        if (!picked) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }

        if (picked === "assemble") {
          await runAssemble(ctx);
          return;
        }

        if (picked === "assign") {
          const name = await ctx.ui.input("要归类的插件/技能", "npm:包名 或 skill:名称");
          if (!name) return;
          const target = await ctx.ui.select("归到哪个场景？", [
            ...SCENARIOS.map((s) => `${s.id} · ${s.title}`),
            "none · 取消归类",
            "infra · 基础设施（不进入场景）",
          ]);
          if (!target) return;
          args = `assign ${String(name).trim()} ${target.split(" · ")[0]}`;
        } else {
          args = picked;
        }
      }

      if (args === "assemble") {
        scan(false);
        if (!requireUI(ctx)) return;
        await runAssemble(ctx);
        return;
      }

      if (args === "workflow") {
        scan(false);
        if (!requireUI(ctx)) return;
        const workflows = await pickManyFrom(ctx, "选工作流（可多选）", orderWorkflows(), (w) => `${w.id} · ${w.title}`, 3);
        if (!workflows.length) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
        const workflow = comboWorkflows(workflows);
        const scenario = workflowOnlyScenario(workflow);
        const res = applyScenario(pi, ctx, scenario, store, baseline, workflow);
        activeScenario = scenario;
        activeWorkflow = workflow;
        pi.appendEntry("function-scenario", { id: "workflow", workflow: workflow.id, at: nowIso(), tools: res.next });
        ctx.ui.notify(`已启用工作流「${workflow.title}」：${scenario.plugins.length} 个插件、${scenario.skillIds.length} 个技能；不绑定任务场景。`, "info");
        return;
      }

      if (args === "scan") {
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

      if (args === "profile") {
        ensureProfile(store);
        pi.sendMessage({ customType: "function-profile", content: buildProfileReport(store), display: true });
        return;
      }

      if (args.startsWith("stats")) {
        const reset = /reset|clear/i.test(args);
        if (reset) {
          store.usage = {};
          store.manualAdds = {};
          store.itemUse = {};
          saveStore(store);
          ctx.ui.notify("已清空使用统计", "info");
          return;
        }
        const lines = ["## 分配统计（阶段 D 使用反馈）"];
        const usage = Object.entries(store.usage || {});
        if (!usage.length) {
          lines.push("- 还没有记录：每次 /function 装配会累积一次");
        } else {
          for (const [sid, bucket] of usage.slice(0, 8)) {
            const items = Object.entries(bucket).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`);
            lines.push(`- ${sid}: ${items.join("、")}`);
          }
        }
        const manual = Object.entries(store.manualAdds || {}).flatMap(([sid, bucket]) => Object.entries(bucket).map(([k, v]) => `${k}→${sid}×${v}`));
        const used = Object.entries(store.itemUse || {}).flatMap(([sid, bucket]) => Object.entries(bucket).map(([k, v]) => `${k}(${sid})×${v}`));
        lines.push(used.length ? `真实调用：${used.slice(0, 8).join("、")}` : "真实调用：无记录");
        lines.push(manual.length ? `手动指定：${manual.slice(0, 8).join("、")}` : "手动指定：无");
        lines.push("加分规则：0.25×log(1+装配次数) + 0.8（手动指定），上限 1.2");
        pi.sendMessage({ customType: "function-stats", content: lines.join(String.fromCharCode(10)), display: true });
        ctx.ui.notify(`统计已输出（${usage.length} 个场景有记录）`, "info");
        return;
      }

      if (args === "status") {
        const lines = [];
        const label = activeScenario
          ? activeScenario.workflowOnly
            ? activeScenario.title
            : `${activeWorkflow ? activeWorkflow.title + " × " : ""}${activeScenario.title}${activeScenario.dynamic ? "（动态）" : ""}`
          : "未装配";
        lines.push(`当前组合：${label}`);
        if (activeScenario?.dynamic) {
          lines.push(`需求：${activeScenario.when}`);
          lines.push(`动态插件：${activeScenario.plugins.length ? activeScenario.plugins.join(", ") : "（无）"}`);
          lines.push(`动态技能：${activeScenario.skillIds?.length ? summarizeSkills(activeScenario.skillIds) : "（无）"}`);
        }
        lines.push(`已收录条目：${Object.keys(store.known).length} 个（自动归类 ${Object.values(store.known).filter((m) => m.auto).length}）`);
        const optionalActive = pi.getActiveTools().filter((n) => {
          const t = pi.getAllTools().find((x) => x.name === n);
          return t && isOptionalSource(t.sourceInfo);
        });
        lines.push(`当前启用的插件工具：${optionalActive.length ? optionalActive.join(", ") : "（无）"}`);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (args === "off") {
        const restored = uniq([...(baseline.length ? baseline : pi.getActiveTools()), ...coreToolNames(pi)])
          .filter((n) => pi.getAllTools().some((t) => t.name === n));
        pi.setActiveTools(restored);
        activeScenario = null;
        activeWorkflow = null;
        // 写 null 墓磑，否则重启后会从会话记录里把旧场景又拉回来
        pi.appendEntry("function-scenario", { id: null, at: nowIso(), tools: restored });
        ctx.ui.notify(`已还原到装配前工具集（${restored.length} 个工具）`, "info");
        return;
      }

      if (args === "assign" || /^assign\s+\S+\s+\S+$/i.test(args)) {
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
        if (scenarioId !== "none" && scenarioId !== "infra") {
          store.manualAdds = store.manualAdds || {};
          const bucket = store.manualAdds[scenarioId] = store.manualAdds[scenarioId] || {};
          const key = name.replace(/^npm:/, "");
          bucket[key] = (bucket[key] || 0) + 1;
        }
        saveStore(store);
        ctx.ui.notify(`已把 ${name} 指定到 ${scenarioId}`, "info");
        return;
      }

      const comboIds = args.split(/[+＋,，、]/).map((s) => s.trim()).filter(Boolean);
      if (comboIds.length > 1) {
        const unknown = comboIds.filter((id) => !workflowById(id) && !SCENARIOS.some((s) => s.id === id));
        if (unknown.length) {
          ctx.ui.notify(`未知 id：${unknown.join("、")}。可用 /function 查看清单，写法如 /function debug+process`, "error");
          return;
        }
        if (!requireUI(ctx)) return;
        scan(false);
        const workflows = comboIds.map((id) => workflowById(id)).filter(Boolean);
        const scenarios = comboIds.filter((id) => !workflowById(id)).map((id) => SCENARIOS.find((s) => s.id === id)).filter(Boolean);
        const workflow = comboWorkflows(workflows) || (scenarios.length ? workflowById(recommendWorkflow(scenarios[0])) : null);
        const scenario = scenarios.length ? comboScenarios(scenarios) : workflowOnlyScenario(workflow);
        if (!scenario) { ctx.ui.notify("组合无效，未做任何改动", "warning"); return; }
        const ok = await confirmScenario(ctx, scenario, "多选组合", workflow);
        if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
        const res = applyScenario(pi, ctx, scenario, store, baseline, workflow);
        activeScenario = scenario;
        activeWorkflow = workflow;
        pi.appendEntry("function-scenario", { id: comboIds.join("+"), workflow: workflow?.id || null, at: nowIso(), tools: res.next });
        ctx.ui.notify(`已装配「${[workflow?.title, scenario.title].filter(Boolean).join(" × ")}」：启用 ${res.enabled.length} 个工具，停用 ${res.disabled.length} 个可选工具`, "info");
        return;
      }

      scan(false);
      const analysis = analyzeNeed(args, store);
      const recommended = recommendWorkflow(analysis.intents[0]?.scenario);

      if (!requireUI(ctx)) {
        const scenario = dynamicScenario(args, analysis, null);
        pi.sendMessage({ customType: "function-need", content: buildProposal(pi, scenario, store, null), display: true });
        return;
      }

      const workflows = await pickManyFrom(ctx, "选工作流（可多选，推荐的在第 1 个）", orderWorkflows(recommended), (w) => `${w.id} · ${w.title}${w.id === recommended ? "  ← 推荐" : ""}`);
      if (!workflows.length) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
      const workflow = comboWorkflows(workflows);
      const scenario = dynamicScenario(args, analysis, workflow);
      const ok = await confirmScenario(ctx, scenario, "按需求动态组合", workflow);
      if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
      const gaps = capabilityGaps(scenario, store, workflow);
      const wanted = await askMissingCapabilities(ctx, gaps);
      const declined = gaps.filter((g) => !wanted.some((w) => w.id === g.id));
      if (declined.length) scenario.declinedGaps = declined.map((g) => g.label);
      const res = applyScenario(pi, ctx, scenario, store, baseline, workflow);
      activeScenario = scenario;
      activeWorkflow = workflow;
      pi.appendEntry("function-scenario", {
        id: "custom",
        workflow: workflow.id,
        at: nowIso(),
        tools: res.next,
        custom: {
          need: args,
          packages: scenario.plugins,
          skills: scenario.skillIds,
          confidence: analysis.confidence,
          intents: analysis.intents.map((r) => ({ id: r.scenario.id, title: r.scenario.title, score: r.score, hits: r.hits })),
        },
      });
      const searching = dispatchSkillSearch(ctx, scenario, wanted, args);
      const restored = typeof ctx.ui.setEditorText === "function";
      if (!searching && restored) ctx.ui.setEditorText(args);
      const head = `已按需求组合「${workflow.title} × 动态任务」：${scenario.plugins.length} 个插件、${scenario.skillIds.length} 个技能；启用 ${res.enabled.length} 个工具，停用 ${res.disabled.length} 个可选工具。`;
      ctx.ui.notify(
        searching
          ? `${head}已发起 find-skill 搜索；装好技能后回来说一声继续。`
          : restored
            ? `${head}需求没有自动执行；已放回输入框，按 Enter 才会开始。`
            : `${head}需求没有自动执行，请手动重新发送。`,
        "info",
      );
    },
  };

  const restoreScenario = (ctx) => {
    let last = null;
    try {
      for (const entry of ctx?.sessionManager?.getBranch?.() || []) {
        if (entry?.type === "custom" && entry.customType === "function-scenario") last = entry.data || null;
      }
    } catch { last = null; }
    if (!last || !last.id) return;
    activeWorkflow = last.workflow ? workflowById(last.workflow) : null;
    let scenario = null;
    if (last.id === "workflow" && activeWorkflow) {
      scenario = workflowOnlyScenario(activeWorkflow);
    } else if (last.id && last.id.includes("+")) {
      // 多选组合：id 形如 debug+process，重启后要能按原样拼回来。
      const ids = String(last.id).split("+").filter(Boolean);
      const comboWfs = ids.map((id) => workflowById(id)).filter(Boolean);
      const comboScs = ids.filter((id) => !workflowById(id)).map((id) => SCENARIOS.find((s) => s.id === id)).filter(Boolean);
      if (comboWfs.length) activeWorkflow = comboWorkflows(comboWfs);
      scenario = comboScs.length ? comboScenarios(comboScs) : (activeWorkflow ? workflowOnlyScenario(activeWorkflow) : null);
    } else if (last.id === "custom" && last.custom?.need) {
      const analysis = analyzeNeed(last.custom.need, store);
      scenario = dynamicScenario(last.custom.need, analysis, activeWorkflow);
      if (Array.isArray(last.custom.packages)) scenario.plugins = last.custom.packages;
      if (Array.isArray(last.custom.skills)) scenario.skillIds = last.custom.skills;
    } else {
      scenario = SCENARIOS.find((s) => s.id === last.id) || null;
    }
    if (!scenario) return;
    activeScenario = scenario;
    const res = applyScenario(pi, ctx, scenario, store, baseline, activeWorkflow);
    const bad = res.bad || [];
    ctx?.ui?.notify?.(
      `已从会话记录恢复组合：${activeWorkflow ? activeWorkflow.title + " × " : ""}${scenario.title}（${new Date(last.at || Date.now()).toLocaleString()}）` +
        (bad.length ? `\n不可用：${bad.map((r) => r.pkg).join("、")}` : ""),
      bad.length ? "warning" : "info",
    );
  };

  pi.registerCommand("function", functionCommand);
  pi.registerCommand("pi-function", functionCommand);

  // -------------------------------------------------------------------------
  // 模型侧入口：只读的场景建议 + 插件可用性诊断
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "suggest_scenario",
    label: "Suggest Scenario",
    description:
      "分析任务描述：返回命中的多个任务信号、动态插件/技能组合、推荐工作流，以及这些插件当前是否真的可用（absent 未安装 / inactive 未启用或未完成设置 / warn 有已知限制 / ok 正常）。即使没有命中固定场景，也会按能力描述给出组合。只读，不改变任何工具状态。",
    promptSnippet: "查询 /function 场景分类：给出任务最匹配的插件场景与可用性诊断",
    promptGuidelines: [
      "Use suggest_scenario at the start of a task when you need to pick which plugin scene fits, or when the user asks whether a plugin or skill applies.",
      "suggest_scenario is read-only: it never changes active tools. To assemble a fixed scene, tell the user to run /function (then pick); for a need, tell them to run /function \"<need>\" so it analyzes and composes dynamically.",
      "For 流程 / SOP / 需求→工具分配 requests, allocate by 基元 not by name: 拆基元（workflow-refactor）→ 定验收（spec-workflow-guide）→ 固化 SOP（sop-builder / sop-extractor）→ 补缺口（skill-finder），then map each 基元 to a plugin or skill and say which 基元 it serves.",
    ],
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "任务或需求的描述文本" },
        top: { type: "number", description: "返回几个候选场景，默认 3，范围 1-5" },
        withPlugins: { type: "boolean", description: "是否附带插件与可用性明细，默认 true" },
      },
      required: ["text"],
    },
    async execute(_toolCallId, params) {
      const text = String(params?.text || "");
      const top = Math.max(1, Math.min(5, Number(params?.top) || 3));
      scan(false);
      const ranked = scoreScenarios(text).slice(0, top);
      const analysis = analyzeNeed(text, store);
      const dynamic = dynamicScenario(text, analysis, null);
      if (!ranked.length) {
        const lines = [
          "没有命中固定任务场景；以下按需求与能力描述动态组合。",
          `识别到：${analysis.intents.length ? analysis.intents.map((r) => `${r.scenario.title}（${r.hits.slice(0, 3).join(" / ")}）`).join("；") : "无固定任务信号"}`,
          `动态插件：${analysis.packages.length ? analysis.packages.map((x) => `${x.pkg}：${x.reasons[0] || "能力匹配"}`).join("；") : "无（只保留核心工具）"}`,
          `动态技能：${analysis.skills.length ? analysis.skills.map((x) => x.skill).join("、") : "无"}`,
          `推荐工作流：${recommendWorkflow(analysis.intents[0]?.scenario)}`,
          `装配入口（需用户执行，仍需确认）：/function "${text.replace(/"/g, "\\\"")}"`,
        ];
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { matched: false, ranked: [], dynamic },
        };
      }
      const best = ranked[0];
      const confident = best.score >= 1.2 && (!ranked[1] || best.score >= ranked[1].score * 1.5);
      const lines = [
        `最佳场景：${best.scenario.id} · ${best.scenario.title}（score ${best.score.toFixed(2)}；命中：${uniq(best.hits).slice(0, 5).join(" / ")}）`,
        confident ? "置信度：足够（领先次选 ≥1.5 倍）" : "置信度：不足，建议把候选摆给用户选",
        `推荐工作流：${recommendWorkflow(best.scenario)} · ${WORKFLOWS.find((w) => w.id === recommendWorkflow(best.scenario))?.title || "直接执行"}`,
      ];
      if (best.scenario.id === "process" || analysis.skills?.some((s) => PROCESS_SKILL_IDS.includes(s.skill))) {
        lines.push("分配方法：先拆基元（workflow-refactor）→ 定验收（spec-workflow-guide）→ 固化 SOP（sop-builder/sop-extractor）→ 补缺口（skill-finder）→ 再按基元分配插件与技能");
      }
      if (ranked.length > 1) {
        lines.push("其他候选：" + ranked.slice(1).map((r) => `${r.scenario.id}(${r.score.toFixed(2)})`).join("、"));
      }
      lines.push("");
      lines.push("动态组合（带需求文本时 /function 会按此装配，而不是强行选一个任务）：");
      lines.push(`- 任务信号：${analysis.intents.length ? analysis.intents.map((r) => `${r.scenario.id}(${r.score.toFixed(2)})`).join("、") : "无"}`);
      lines.push(`- 插件：${analysis.packages.length ? analysis.packages.map((x) => x.pkg).join("、") : "无（只保留核心工具）"}`);
      lines.push(`- 技能：${analysis.skills.length ? analysis.skills.map((x) => x.skill).join("、") : "无"}`);
      if (params?.withPlugins !== false) {
        for (const r of ranked) {
          const rows = auditPackages(pi, r.scenario, store);
          const bad = rows.filter((x) => x.state !== "ok");
          lines.push("");
          lines.push(`### ${r.scenario.id}`);
          lines.push("- 插件：" + (rows.length ? rows.map((x) => `${x.pkg}[${x.state}]`).join("、") : "无额外插件（只保留核心工具）"));
          const skills = scenarioSkillIds(store, r.scenario.id);
          lines.push("- 技能：" + (skills.length ? `${skills.length} 个 — ${summarizeSkills(skills, 4)}` : "无自动归入技能"));
          const cov = auditCoverage(r.scenario, store);
          if (cov.missing.length) lines.push("- 漏用：" + cov.missing.map((m) => m.need).join("、"));
          if (bad.length) lines.push("- 需注意：" + bad.map((x) => `${x.pkg} — ${x.detail}`).join("；"));
        }
      }
      lines.push("");
      lines.push(`固定场景菜单入口（需用户执行）：/function`);
      lines.push(`按需求动态装配入口（需用户执行并确认）：/function "${text.replace(/"/g, "\\\"")}"`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
          matched: true,
          confident,
          best: { id: best.scenario.id, score: best.score, hits: uniq(best.hits) },
          ranked: ranked.map((r) => ({ id: r.scenario.id, score: r.score, hits: uniq(r.hits) })),
          dynamic,
        },
      };
    },
  });

  pi.on("session_start", (event, ctx) => {
    captureBaseline();
    const added = scan(false);
    if (added.length) {
      // 静默记录；/function status 可查
      store.lastAdded = added.slice(0, 20);
      saveStore(store);
    }
    startWatcher(ctx);
    restoreScenario(ctx);
  });

  pi.on("session_shutdown", () => {
    stopWatcher();
  });

  // 真实使用反馈（阶段 D 强信号）：Pi 每次工具调用都会触发这个钩子。
  // 不支持该事件的版本不会调用它，也不影响其它功能。
  let useWrites = 0;
  try {
    pi.on("tool_call", (event) => {
      try {
        if (!activeScenario) return;
        const sid = activeScenario.comboIds?.length ? activeScenario.comboIds.join("+") : activeScenario.id;
        const toolName = event?.toolName || event?.tool?.name || event?.name;
        const item = recordToolUse(store, sid, toolName, pi.getAllTools?.() || []);
        if (item) {
          useWrites += 1;
          if (useWrites % 5 === 0) saveStore(store); // 每 5 次落盘一次，避免频繁写
        }
      } catch { /* 反馈不能影响主流程 */ }
    });
  } catch { /* 旧版本 Pi 没有 tool_call 事件 */ }

  pi.on("before_agent_start", (event) => {
    if (!activeScenario) return;
    const extra = [
      "",
      `## 当前组合（/function 装配）：${activeScenario.workflowOnly ? activeScenario.title : `${activeWorkflow ? activeWorkflow.title + " × " : ""}${activeScenario.title}`}`,
      activeWorkflow ? `### 工作流：${activeWorkflow.title}\n${activeWorkflow.brief}\n流程：${(activeWorkflow.steps || []).join(" → ")}\n检查点：${activeWorkflow.checkpoint || "按流程执行"}\n完成标准：${activeWorkflow.doneWhen || "达到任务目标"}` : "",
      activeScenario.workflowOnly ? "" : `### 任务：${activeScenario.title}\n${activeScenario.brief}`,
      activeScenario.id === "process" || activeWorkflow?.id === "process-design"
        ? `### 分配方法（先拆解再分配）\n${ALLOCATION_METHOD.map((step, i) => `${i + 1}. ${step}`).join("\n")}`
        : "",
      `### 开工前先问清（没问清就直接做等于猜）\n${followupQuestions(activeScenario, activeWorkflow).map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
      "方向：先给一句话说明你打算怎么做（几步、每步产出），确认后再动手；用户已经答过的问题不要重复问。",
      (activeWorkflow?.manual?.length || activeScenario.manual?.length)
        ? `仍需手动：${uniq([...(activeWorkflow?.manual || []), ...(activeScenario.manual || [])]).join("；")}`
        : "",
      activeScenario.skillGaps?.length
        ? `### 能力缺口：已征得同意去找\n${activeScenario.skillGaps.join("、")}\n先用 find-skill 搜索；装之前让用户确认；找不到就说明缺口，不要假装能做到。`
        : "",
      activeScenario.declinedGaps?.length
        ? `### 能力缺口：用户选择不找\n${activeScenario.declinedGaps.join("、")}\n不要假装能做；先说明限制并给替代方案。`
        : "",
      "只使用当前已启用的工具；缺工具时提示用户运行 /function 重新装配。",
    ].filter(Boolean).join("\n");
    return { systemPrompt: event.systemPrompt + "\n" + extra };
  });
}

// 供测试使用
// 测试用接口：内部纯函数也导出，避免测试只能靠端到端猜（见 function-menu-tests/TEST-PLAN.md L1）
export { NEED_CAPABILITIES, capabilityGaps, findSkillCommandName, skillSearchMessage, TAG_VOCAB, tagsOf, selectByCoverage, usageBoost, recordUsage, recordToolUse, USAGE_BOOST_CAP, needTerms, termScore, termScoreDistinct, GENERIC_TERMS, NEED_STOP, SCENARIO_HINTS, DYNAMIC_LIMITS as LIMITS, SCENARIO_CONTRACTS, contractFor, auditCoverage, SCENARIOS, WORKFLOWS, workflowOnlyScenario, normalizeWorkflowId, workflowById, buildProfileReport, CAPABILITIES, SCENARIO_CAPABILITIES, WORKFLOW_CAPABILITIES, WORKFLOW_SKILL_PATTERNS, buildProfile, hydrateCatalog, scoreScenarios, classifyItem, buildCatalog, buildProposal, discoverItems, reconcile, loadStore, saveStore, storePath, scenarioPackages, scenarioSkillIds, comboPackages, comboSkillIds, comboScenarios, comboWorkflows, followupQuestions, DYNAMIC_LIMITS, workflowOptions, recommendWorkflow, matchesPkg, CORE_TOOLS, CLASSIFIER_VERSION, summarizeSkills, coreToolNames, applyScenario, analyzeNeed, dynamicScenario };

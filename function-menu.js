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
 * 模型侧入口：suggest_scenario 工具（只读）—— 按同一套关键词表打分，
 * 返回最匹配场景 + 各插件可用性（absent / inactive / warn / ok），不改变任何状态。
 * 想真正装配仍需用户执行 /function <场景id>。
 *
 * 装配 = 启用该场景相关工具 + 注入场景流程提示 + 停用无关插件工具。
 * 插件代码本身常驻进程（Pi 不支持运行时装卸扩展），所以“装配”是工具/提示层面的。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const VERSION = "1.6.0";
const NAME = "Pi-function";
const STORE_FILE = "function-menu.json";
const CLASSIFIER_VERSION = 3;
const ALWAYS_PACKAGES = ["pi-mcp-adapter"];
// 核心工具永远保留；pi-pretty 的 disableTools 可能把它们从默认激活集里移除
const CORE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
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
  "@opengsd/gsd-core": "gsd",
  "pi-advisor-flow": "advisor",
  "@quintinshaw/pi-dynamic-workflows": "parallel",
  "@getpipher/vision": "webui",
  "pi-btw": "sideask",
  "context-mode": "infra",
  "pi-mcp": "mcp",
};

// skill 的固定归属（classifyItem 已剥掉 "skill:" 前缀，所以这里写裸名）
const KNOWN_SKILL_SCENARIO = {
  "agent-handbook": "review",
  "agent-workflow": "unattended",
  "architect": "plan",
  "browser-use": "webui",
  "caveman-explore": "understand",
  "de-slop": "frontend",
  "find-skills": "knowledge",
  "frontend-design": "frontend",
  "handoff": "docs",
  "improve-codebase-architecture": "understand",
  "investigate-first": "bugfix",
  "lean-build": "feature",
  "prove-it": "tests",
  "qa": "webui",
  "safe-refactor": "refactor",
  "surgical-patch": "bugfix",
  "verify-and-stop": "review",
  "branch-name": "release",
  "caveman-commit": "release",
  "btw": "sideask",
  "council-mode": "parallel",
  "ctx-doctor": "data",
  "ctx-stats": "data",
  "ctx-upgrade": "data",
  "fallow": "review",
  "fallow-setup": "review",
  "glimpse": "infra",
  "mermaid-diagrams": "docs",
  "ponytail": "feature",
  "ponytail-audit": "audit",
  "ponytail-debt": "audit",
  "ponytail-gain": "data",
  "ponytail-help": "knowledge",
  "ponytail-review": "review",
  "workflow-authoring": "parallel",
  "workflow-patterns": "parallel",
  "pi-advisor-flow": "advisor",
  "pi-lens-ast-grep": "review",
  "pi-lens-lsp-navigation": "understand",
  "pi-lens-write-ast-grep-rule": "review",
  "pi-lens-write-tree-sitter-rule": "review",
  "pi-subagents": "parallel",
  "write-connector": "docs",
};

// ---------------------------------------------------------------------------
// 场景目录（可自行增删；新插件会被自动归类到这里）
// ---------------------------------------------------------------------------
const SCENARIOS = [
  {
    id: "understand", group: "理解", title: "看懂代码 / 接手仓库",
    when: "陌生仓库、想弄清结构、找某段逻辑在哪、读遗留代码",
    keywords: ["看懂", "理解", "接手", "陌生", "架构", "结构", "在哪", "怎么工作", "读代码", "梳理", "考古", "历史", "onboarding", "understand", "walkthrough", "legacy", "explain", "overview"],
    plugins: ["openwiki", "pi-lens", "pi-btw", "pi-memory", "pi-web-access"],
    brief: "先建立地图再下钻：用 project_report / symbol_search / module_report 定位符号与模块，用 openwiki 查仓库 wiki，用 grep/find 搜索；只读旁问交给 pi-btw；结论写入 pi-memory。不要一上来就改文件。",
    manual: ["首次用 openwiki_begin 扫全库（较慢）", "只想问不想改：/btw:ask \"…\""],
  },
  {
    id: "docs", group: "理解", title: "文档 / Wiki / 交接",
    when: "写 README、架构说明、ADR、mermaid 图，或把任务交接给下一个人",
    keywords: ["文档", "说明", "readme", "wiki", "handoff", "交接", "注释", "docstring", "changelog", "手册", "mermaid", "adr"],
    plugins: ["openwiki", "pi-memory"],
    brief: "先确认读者与用途再写：架构/流程写进 openwiki，长期决策写进 memory；交接用 /skill:handoff 生成自包含文档；图用 mermaid，命令/路径必须来自实际仓库。",
    manual: ["/skill:handoff 生成交接文档", "/skill:mermaid-diagrams 画流程图", "GSD 用户可加 /skill:gsd-docs-update"],
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
    plugins: ["context-mode", "pi-web-access", "pi-lens"],
    brief: "先复现再改：用 ctx_execute 跑最小复现并过滤日志，用 web_search 查报错原文；用 lens_diagnostics / LSP 定位类型与符号问题；定位到根因后只改必要处，最后跑同一复现验证。",
    manual: ["大日志交给 ctx_execute，别整段贴进对话", "pi-lens 的 hooks 默认关闭；工具仍可手动调用，/lens-toggle 可开自动检查"],
  },
  {
    id: "feature", group: "修改", title: "写新功能（完整流程）",
    when: "从零加一个功能、需要阶段推进和任务跟踪",
    keywords: ["新功能", "实现", "开发", "加一个功能", "feature", "implement", "从零", "需求", "阶段"],
    plugins: ["@juicesharp/rpiv-todo", "pi-lens"],
    brief: "先拆分再实现：用 todo 建任务清单，逐项实现；每完成一项跑测试；用 lens_diagnostics 或 /lens-toggle 检查静态问题。需要完整规格/阶段流程时改用 /function gsd。",
    manual: ["/todos 查看任务清单", "/lens-toggle 打开自动静态检查"],
  },
  {
    id: "gsd", group: "修改", title: "GSD 规格驱动 / 阶段推进",
    when: "多阶段功能、需要 PRD/计划/验收、上下文容易腐烂的长任务",
    keywords: ["gsd", "规格", "spec", "prd", "里程碑", "milestone", "路线图", "roadmap", "阶段推进", "需求文档", "验收标准", "上下文腐烂", "context rot"],
    plugins: ["@opengsd/gsd-core", "@juicesharp/rpiv-todo", "@plannotator/pi-extension"],
    brief: "按 GSD 五步走：discuss → plan → execute → verify → ship，每阶段用 fresh context，不把旧对话拖进下一阶段；用 /gsd next 或 /gsd progress 推进。Windows 下 gsd_dispatch 不可用，改用 /gsd 命令；计划先给用户确认。",
    manual: ["/gsd next 进入下一步", "/gsd progress 查看阶段", "/gsd verify-work 做验收", "GSD 的 72 个阶段技能已自动归入本场景"],
  },
  {
    id: "frontend", group: "修改", title: "前端页面 / 视觉实现",
    when: "落地页面、改样式、建设计系统、截图对比与视觉验收",
    keywords: ["前端", "样式", "css", "tailwind", "react", "vue", "svelte", "组件", "视觉", "设计系统", "landing page", "响应式", "动效", "ui 实现", "首页", "界面", "手机", "移动端", "适配", "好看", "美化", "排版", "布局", "色彩", "字体"],
    plugins: ["@onkernel/browser-loop", "@getpipher/vision", "pi-web-access"],
    brief: "先定视觉方向与设计系统，再写组件；用 /skill:frontend-design 约束版式与文案，用 /skill:de-slop 去模板味；截图对照必须人眼看关键帧。browser-loop 需先 /browser-tools 选能力并配置 KERNEL_API_KEY；vision 需确认模型真的支持图像。",
    manual: ["/skill:frontend-design 设计方向", "/skill:de-slop 去 AI 味", "/browser-tools 选浏览器能力", "/vision-use 配置/切换视觉模型"],
  },
  {
    id: "refactor", group: "修改", title: "大重构 / 迁移",
    when: "跨文件重构、换框架、批量机械替换",
    keywords: ["重构", "迁移", "重写", "批量", "替换", "refactor", "migrate", "rewrite", "rename", "升级框架"],
    plugins: ["@quintinshaw/pi-dynamic-workflows", "@plannotator/pi-extension", "@juicesharp/rpiv-todo", "pi-simplify", "pi-lens"],
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
    plugins: ["pi-lens", "pi-simplify", "pi-subagents", "@quintinshaw/pi-dynamic-workflows"],
    brief: "先看 diff 统计再逐处审：用 ctx_execute 跑 git diff --stat，只把关键 hunk 放进上下文；用 /simplify、/code-review 或 reviewer 子代理做第二遍；lens_diagnostics 查类型/静态问题；PR 描述写“为什么改 + 怎么验”。",
    manual: ["/simplify --staged", "/code-review", "/subagents 可叫 reviewer / oracle"],
  },
  {
    id: "plan", group: "验证", title: "计划评审",
    when: "动手前要人批准方案、拆阶段",
    keywords: ["计划", "方案", "评审", "拆解", "plan", "design", "批准", "步骤"],
    plugins: ["@plannotator/pi-extension", "@juicesharp/rpiv-todo"],
    brief: "只出计划不写代码：用 plannotator 展示方案等批准，批准后用 todo 拆成可执行项；计划里写清验收标准。",
    manual: ["/plannotator-plan-mode"],
  },
  {
    id: "research", group: "验证", title: "查资料 / 写调研",
    when: "查文档、比对方案、写技术调研",
    keywords: ["查资料", "调研", "文档", "搜索", "资料", "research", "search", "survey", "对比方案", "官网"],
    plugins: ["pi-web-access", "pi-memory", "openwiki", "pi-subagents", "@quintinshaw/pi-dynamic-workflows"],
    brief: "先搜后读再记：web_search 找入口，fetch_content 读原文；独立子问题交给 researcher/evidence-auditor 子代理，或跑 /deep-research 工作流；结论与出处写入 memory。不确定的版本信息必须查官网，不靠记忆。",
    manual: ["/deep-research 多源调研", "/subagents 叫 researcher 做独立取证"],
    manual: [],
  },
  {
    id: "webui", group: "协作", title: "浏览器 / UI 验收",
    when: "页面交互、点击流程、截图对比、端到端验收",
    keywords: ["浏览器", "页面", "首页", "界面", "手机", "移动端", "适配", "好看", "美化", "截图", "点击", "ui", "前端验收", "browser", "playwright", "dom", "e2e", "登录"],
    plugins: ["@onkernel/browser-loop", "@getpipher/vision", "@plannotator/pi-extension"],
    brief: "先选能力再操作：用 /browser-tools 选中需要的 selector，再用 browser_*/computer_* 执行；每步截图确认；视觉模型不可用时用人眼核对关键截图。",
    manual: ["/browser-tools browser 选能力（需要 KERNEL_API_KEY）", "vision 需要已配置视觉模型"],
  },
  {
    id: "data", group: "验证", title: "日志 / 性能 / 数据分析",
    when: "大日志、benchmark、性能剖析、数据统计",
    keywords: ["日志", "性能", "benchmark", "分析", "统计", "profiling", "slow", "内存", "cpu", "latency", "数据", "csv", "脚本", "python", "pandas", "excel"],
    plugins: ["context-mode", "@quintinshaw/pi-dynamic-workflows"],
    brief: "数据不进对话：用 ctx_execute 跑脚本/过滤/聚合，只回传结论行；benchmark 用 workflow 并行跑不同参数；对比要给数字和测试条件。",
    manual: [],
  },
  {
    id: "parallel", group: "协作", title: "并行 / 子代理委派",
    when: "互相独立的模块同时推进，或要把调查/实现/审查分给不同代理",
    keywords: ["并行", "同时", "多任务", "分开做", "parallel", "subagent", "子代理", "并发", "委派", "delegate", "委员会", "council"],
    plugins: ["pi-subagents", "@quintinshaw/pi-dynamic-workflows", "@juicesharp/rpiv-todo"],
    brief: "只并行真正独立的部分：clarify → scout → worker → fresh reviewers，一个子代理一个目录/模块，禁止同时改同一文件；用 todo 记录分支；需要多视角时用 /council，汇总时统一跑测试。",
    manual: ["/council 多顾问辩论", "/workflows run 批量编排"],
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
    plugins: ["@quintinshaw/pi-dynamic-workflows", "pi-lens", "pi-subagents", "pi-web-access"],
    brief: "限定范围再扫：明确目录/依赖清单；用 /codebase-audit 或 workflow 并行检查；evidence-auditor 子代理独立复核；CVE 与许可证必须查官方源；报告写清位置与修复建议。",
    manual: ["/codebase-audit 指定目录", "cc-safety-net 常驻，审计脚本也受保护"],
  },
  {
    id: "release", group: "协作", title: "发布 / CI 排查",
    when: "合并前检查、CI 失败、打 tag、写 release notes",
    keywords: ["发布", "上线", "ci", "流水线", "release", "tag", "合并", "部署", "build 失败"],
    plugins: ["pi-simplify", "@juicesharp/rpiv-todo", "pi-subagents"],
    brief: "按清单走：先看 CI 日志定位第一处失败（不是最后一处），修完本地复跑；合并前 /simplify 自查，必要时叫 reviewer 子代理；release notes 按“破坏性变更/新功能/修复”分组。",
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
    noAlways: true,
    noWorkflow: true,
    plugins: [],
    brief: "默认全关：不联网、不上报、不用云浏览器，连 MCP 也停用；只保留本地核心工具与安全网。需要联网时必须先说明并征得同意。",
    manual: ["确认 langsmith / vision / browser-loop / MCP 均未启用"],
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
    keywords: ["依赖", "升级", "版本", "dependency", "upgrade", "breaking", "npm outdated", "lockfile", "打包", "构建"],
    plugins: ["pi-web-access", "pi-lens"],
    brief: "先读 changelog 再升：查目标版本 breaking changes，小步升级并每步跑测试；类型错误用 /lens-toggle 打开检查；锁文件冲突按 lockfile 优先。",
    manual: ["/lens-toggle 看类型错误"],
  },
];

// ---------------------------------------------------------------------------
// 工作流目录：先选“怎么执行”，再选“做什么任务”
// 工作流只负责流程与执行方式；任务场景负责领域插件与技能，两者按并集装配。
// ---------------------------------------------------------------------------
const WORKFLOWS = [
  {
    id: "direct", title: "直接执行",
    when: "需求清楚、范围小、不需要额外流程",
    keywords: ["直接", "快速", "小任务", "direct", "quick"],
    plugins: [],
    brief: "直接做最小可验证的改动：先读目标文件，改完立即做针对性验证；不写计划文档，不引入额外流程。",
    manual: [],
  },
  {
    id: "plan-first", title: "计划先行",
    when: "先要方案/步骤，确认后再动手",
    keywords: ["计划", "方案", "先想", "拆解", "plan", "design"],
    plugins: ["@plannotator/pi-extension", "@juicesharp/rpiv-todo"],
    brief: "先只出计划，不写代码：写清目标、步骤、验收标准与风险；用 plannotator 让用户审阅，批准后用 todo 拆项执行。",
    manual: ["/plannotator-plan-mode 审计划", "/todos 查看任务清单"],
  },
  {
    id: "test-first", title: "测试先行",
    when: "行为明确、需要先复现或补失败测试",
    keywords: ["测试", "tdd", "先写测试", "复现", "test-first"],
    plugins: ["pi-lens", "@juicesharp/rpiv-todo"],
    brief: "先复现/写一个会失败的测试，再改实现让测试通过，最后跑同一组测试回归；不要先改实现再补测试。",
    manual: ["/lens-toggle 让类型/静态错误即时可见"],
  },
  {
    id: "fanout", title: "子代理并行",
    when: "任务能拆成互不冲突的独立分片",
    keywords: ["并行", "子代理", "fan-out", "拆开", "parallel", "subagent"],
    plugins: ["pi-subagents", "@quintinshaw/pi-dynamic-workflows", "@juicesharp/rpiv-todo"],
    brief: "只并行真正独立的部分：先列清单，再按目录/模块分片；一个子代理一个范围，禁止同时改同一文件；最后统一汇总并跑全量测试。",
    manual: ["/council 多顾问辩论", "/workflows run 批量编排"],
  },
  {
    id: "review-gate", title: "评审守门",
    when: "实现后需要独立审查再交付",
    keywords: ["评审", "review", "审查", "守门", "第二意见", "gate"],
    plugins: ["pi-subagents", "@quintinshaw/pi-dynamic-workflows", "pi-simplify", "pi-lens"],
    brief: "实现完成后不直接交付：先跑 diff/静态检查，再让 fresh reviewer 子代理独立审查；按发现修复后重新验证，最后才总结。",
    manual: ["/simplify --staged", "/code-review"],
  },
  {
    id: "phased", title: "阶段推进",
    when: "多阶段、长任务，需要规格/计划/验收分阶段推进",
    keywords: ["gsd", "阶段", "里程碑", "规格", "phased", "milestone"],
    plugins: ["@opengsd/gsd-core", "@juicesharp/rpiv-todo", "@plannotator/pi-extension"],
    brief: "按 GSD 五步走：discuss → plan → execute → verify → ship；每阶段用 fresh context，不把旧对话拖进下一阶段；每阶段结束先确认验收再继续。",
    manual: ["/gsd next 进入下一步", "/gsd verify-work 做验收", "Windows 下 gsd_dispatch 不可用，改用 /gsd"],
  },
];

// 自动归类的强信号：包名/工具名/描述里出现这些词就投到对应场景
const SCENARIO_HINTS = {
  understand: ["wiki", "openwiki", "codebase", "explain", "navigate", "symbol", "lsp", "module"],
  docs: ["documentation", "wiki", "readme", "handoff", "mermaid", "guide", "adr"],
  bugfix: ["error", "traceback", "debug", "diagnostic", "stack", "regression"],
  feature: ["todo", "scaffold", "stage", "implement"],
  gsd: ["gsd", "milestone", "roadmap", "spec", "phase", "acceptance", "context rot"],
  frontend: ["frontend", "react", "vue", "svelte", "css", "tailwind", "component", "design system", "responsive"],
  refactor: ["workflow", "plannotator", "refactor", "migrate", "batch", "multi-agent", "simplify"],
  tests: ["test", "jest", "vitest", "pytest", "flaky", "coverage"],
  review: ["review", "simplify", "diff", "lint", "reviewer", "oracle"],
  plan: ["plan", "plannotator", "approve", "design"],
  research: ["web", "search", "fetch", "http", "scrape", "crawl", "deep-research", "researcher"],
  webui: ["browser", "playwright", "screenshot", "dom", "computer", "vision", "image"],
  data: ["benchmark", "profile", "metrics", "execute", "sql", "analytics"],
  parallel: ["subagent", "parallel", "fan-out", "delegate", "council"],
  sideask: ["btw", "side", "chat"],
  advisor: ["advisor", "second opinion", "critique"],
  audit: ["audit", "security", "cve", "license", "safety", "secret", "evidence"],
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
  "pi-lens": { what: "LSP/静态检查/格式化（默认关闭 hooks，工具仍可调用）", manual: "/lens-toggle 临时开" },
  "cc-safety-net": { what: "危险命令拦截（常驻基础设施，不参与装配）", manual: "" },
  "@plannotator/pi-extension": { what: "浏览器里审计划/代码", manual: "/plannotator-plan-mode" },
  "@juicesharp/rpiv-todo": { what: "任务清单与进度跟踪", manual: "/todos" },
  "@juicesharp/rpiv-i18n": { what: "TUI 界面语言切换", manual: "/languages" },
  "@juicesharp/rpiv-ask-user-question": { what: "一次问清多个选项", manual: "" },
  "context-mode": { what: "大输出转指针，省上下文", manual: "" },
  "pi-simplify": { what: "改动收尾自查（/simplify）", manual: "/simplify" },
  "@quintinshaw/pi-dynamic-workflows": { what: "多代理编排与批量审计", manual: "/workflows run …" },
  "@opengsd/gsd-core": { what: "GSD 五步流程 / 72 个阶段技能", manual: "/gsd next；Windows 下 gsd_dispatch 不可用" },
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
    classifierVersion: raw.classifierVersion || 0,
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

const NEED_STOP = new Set([
  "一个", "这个", "那个", "一下", "一些", "可以", "需要", "进行", "使用", "实现", "功能", "问题", "项目", "代码", "文件", "内容", "工作", "任务", "系统", "支持", "相关", "主要", "直接", "重新", "开始", "完成", "处理", "提供", "查看", "检查", "如何", "怎么", "什么", "为什么", "帮我", "然后", "最后", "以及", "并且", "或者", "如果", "已经", "没有", "现在", "我的", "我们", "你们", "他们", "一下", "一点", "有些", "这种", "那种",
]);

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
  return uniq(out.filter((t) => t.length >= 2 && !NEED_STOP.has(t)));
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
function analyzeNeed(text, store = { known: {} }) {
  const raw = String(text || "").trim();
  const terms = needTerms(raw);
  const scored = scoreScenarios(raw);
  const intents = scored.filter((r) => r.score > 0).slice(0, 4);
  const packages = new Map();
  const skills = new Map();
  const privateNeed = /隐私|离线|敏感|保密|内网|不能外发|offline|privacy/.test(norm(raw));
  const useMcp = /\bmcp\b|外部系统|外部服务|外部 api|连接器|接入.*(?:系统|服务)/.test(norm(raw));
  const networkPkgs = new Set(["pi-web-access", "@onkernel/browser-loop", "@getpipher/vision", "langsmith"]);
  const addPkg = (pkg, score, reason) => {
    if (!pkg || pkg === "cc-safety-net" || pkg === "pi-pretty") return;
    if (pkg === "pi-mcp-adapter" && !useMcp) return;
    if (privateNeed && networkPkgs.has(pkg)) return;
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
    for (const pkg of r.scenario.plugins) addPkg(pkg, r.score + 1, `任务信号：${r.scenario.title}（${signal}）`);
    const curated = scenarioSkillIds(store, r.scenario.id).slice(0, 4);
    curated.forEach((skill, idx) => {
      const meta = store.known?.[`skill:${skill}`] || {};
      const hit = termScore(terms, `${skill} ${meta.description || ""}`);
      const reason = hit.score > 0
        ? `任务信号：${r.scenario.title}（${hit.hits.slice(0, 3).join(" / ")}）`
        : `任务候选：${r.scenario.title} 的常用技能`;
      addSkill(skill, hit.score > 0 ? r.score + hit.score : Math.max(0.2, r.score * 0.4 - idx * 0.03), reason);
    });
  }

  for (const pkg of listInstalledPackages()) {
    if (pkg === "pi-mcp-adapter") continue;
    const info = PLUGIN_INFO[pkg] || {};
    const hit = termScore(terms, `${pkg} ${info.what || ""}`);
    if (hit.score >= 1.5) addPkg(pkg, hit.score, `能力描述命中：${hit.hits.slice(0, 3).join(" / ")}`);
  }

  for (const [id, meta] of Object.entries(store.known || {})) {
    if (!id.startsWith("skill:") || meta.missing) continue;
    const skill = id.slice(6);
    const hit = termScore(terms, `${skill} ${meta.description || ""}`);
    if (hit.score >= 1.5) addSkill(skill, hit.score, `技能描述命中：${hit.hits.slice(0, 3).join(" / ")}`);
  }

  if (!intents.length && !packages.size && !skills.size) {
    const codey = /代码|文件|函数|报错|bug|test|重构|页面|接口|模块|脚本|数据|csv|json|yaml|python|node|npm|构建|编译|部署|命令行|cli|程序|游戏|网站|应用|app|开发|工具|compile|error/.test(norm(raw));
    if (codey) addPkg("pi-lens", 0.5, "通用代码检查");
    if (raw.length > 12) addPkg("@juicesharp/rpiv-todo", 0.4, "多步需求跟踪");
  }

  const pkgList = [...packages.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  const skillList = [...skills.values()].sort((a, b) => b.score - a.score).slice(0, 8);
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
  if (item?.id) {
    const key = item.id.replace(/^(npm|skill|local):/, "");
    const known = KNOWN_SCENARIO[key];
    if (known) return { scenarioId: known, score: 99, reason: "已知插件" };
  }
  if (item?.kind === "skill") {
    const bare = String(item.id || "").replace(/^(npm|skill|local):/, "").replace(/^skill:/, "");
    const skillScenario = KNOWN_SKILL_SCENARIO[bare] || (/^gsd-/.test(bare) ? "gsd" : null);
    if (skillScenario) return { scenarioId: skillScenario, score: 99, reason: skillScenario === "gsd" ? "GSD 阶段技能" : "已知技能" };
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
function isInfraId(id) {
  const base = String(id || "").replace(/^(npm|local|skill):/, "").split("/").pop();
  return INFRA_PACKAGES.some((p) => p.split("/").pop() === base);
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
  for (const [id, meta] of Object.entries(store.known)) {
    if (!items.has(id)) meta.missing = true;
  }
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
  return autoAssignedIds(store, scenarioId)
    .filter((id) => id.startsWith("skill:"))
    .map((id) => id.slice(6));
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
  const always = scenario.noAlways ? [] : ALWAYS_PACKAGES;
  return uniq([...always, ...scenario.plugins, ...autoAssigned(store, scenario.id)]);
}

function comboPackages(scenario, store, workflow = null) {
  const base = scenarioPackages(scenario, store);
  // 隐私场景连工作流插件也不加，避免意外引入联网/子代理能力
  if (scenario.noWorkflow || !workflow || workflow.id === "direct") return base;
  return uniq([...base, ...(workflow.plugins || [])]);
}

function recommendWorkflow(scenario) {
  if (!scenario) return "direct";
  if (scenario.id === "gsd") return "phased";
  if (scenario.id === "tests") return "test-first";
  if (scenario.id === "parallel") return "fanout";
  if (scenario.id === "review" || scenario.id === "audit") return "review-gate";
  if (["feature", "refactor", "frontend", "deps"].includes(scenario.id)) return "plan-first";
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
    const count = (w.plugins || []).filter((p) => p !== "pi-mcp-adapter").length;
    const pluginBit = count ? `${count} 个插件` : "无额外插件";
    const mark = w.id === recommendedId ? "★ 推荐 · " : "";
    return `${w.id} · ${w.title} — ${mark}${pluginBit}`;
  });
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
  const info = PLUGIN_INFO[pkg] || {};
  const tools = pi.getAllTools().filter((t) => matchesPkg(t.sourceInfo, pkg)).map((t) => t.name);
  const cmds = commandsForPkg(pi, pkg).map((c) => "/" + c.name);
  const skills = pi.getCommands().filter((c) => c.source === "skill" && matchesPkg(c.sourceInfo, pkg)).map((c) => c.name);
  const bits = [info.what || "插件"];
  if (tools.length) bits.push("工具 " + tools.join(", "));
  if (cmds.length) bits.push("命令 " + cmds.slice(0, 6).join(", "));
  if (skills.length) bits.push("技能 " + summarizeSkills(skills));
  if (pkg === "pi-memory") bits.push("semantic/deep 检索需 qmd；缺少时用 keyword");
  if (manual || info.manual) bits.push("手动 " + (manual || info.manual));
  return bits.join(" · ");
}

function buildProposal(pi, scenario, store, workflow = null) {
  const lines = [];
  const comboTitle = workflow ? `${workflow.title} × ${scenario.title}` : scenario.title;
  lines.push(`## 装配：${comboTitle}`);
  if (workflow) {
    lines.push(`**工作流**：${workflow.when}`);
    lines.push(`- 流程：${workflow.brief}`);
  }
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
  lines.push("**将启用的插件与功能**");
  const pkgs = comboPackages(scenario, store, workflow);
  const extra = pkgs.filter((p) => p !== "pi-mcp-adapter");
  if (!extra.length && !pkgs.includes("pi-mcp-adapter")) lines.push("- 不启用额外插件（只保留核心工具）");
  for (const pkg of extra) {
    const fromWorkflow = workflow?.plugins?.includes(pkg) && !scenario.plugins.includes(pkg);
    const reason = scenario.dynamic ? scenario.analysis?.packages?.find((x) => x.pkg === pkg)?.reasons?.[0] : "";
    lines.push(`- \`${pkg}\`${fromWorkflow ? "（工作流）" : ""} — ${describePlugin(pi, pkg)}${reason ? `（${reason}）` : ""}`);
  }
  if (pkgs.includes("pi-mcp-adapter")) lines.push("- `pi-mcp-adapter` — MCP 代理（按需求启用）");
  const auto = autoAssigned(store, scenario.id).filter((p) => !comboPackages(scenario, store, workflow).includes(p));
  if (auto.length) lines.push(`- 自动归入：${summarizeNames(auto)}`);
  const skills = scenario.dynamic ? (scenario.skillIds || []) : scenarioSkillIds(store, scenario.id);
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
  const manual = uniq([...(workflow?.manual || []), ...(scenario.manual || [])]);
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
  const vision = readJson(path.join(agentDir(), "vision.json"), {});
  const lens = readJson(path.join(os.homedir(), ".pi-lens", "config.json"), {});
  const advisor = readJson(path.join(agentDir(), "advisor.json"), {});
  const rows = [];
  for (const pkg of comboPackages(scenario, store, workflow).filter((p) => p !== "pi-mcp-adapter")) {
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

    if (pkg === "@onkernel/browser-loop" && !tools.length) {
      state = "inactive";
      detail = "命令已注册但还没选浏览器能力；先 /browser-tools 并配置 KERNEL_API_KEY";
    }
    if (pkg === "pi-lens" && lens?.lens?.enabled === false) {
      if (state === "ok") state = "warn";
      detail += "；全局 hooks 已关闭，工具仍可手动调用，/lens-toggle 可开自动检查";
    }
    if (pkg === "@getpipher/vision") {
      const configured = vision?.enabled !== false && vision?.provider && vision?.model;
      if (!configured) {
        state = "inactive";
        detail = "未配置视觉模型；先 /vision-use 选择支持图像的模型";
      } else {
        if (state === "ok") state = "warn";
        detail += `；配置为 ${vision.provider}/${vision.model}，需确认该模型真的支持图像`;
      }
    }
    if (pkg === "@opengsd/gsd-core") {
      if (state === "ok") state = "warn";
      detail += "；Windows 下 gsd_dispatch 不可用，改用 /gsd 命令";
    }
    if (pkg === "pi-advisor-flow" && !(advisor.advisorProvider && advisor.advisorModel) && !advisor.advisorRef) {
      if (state === "ok") state = "warn";
      detail += "；未配置顾问模型，先 /advisor-models";
    }
    if (pkg === "pi-memory") {
      detail += "；semantic/deep 检索需要 qmd，缺少时 keyword 仍可用";
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
  return { next, enabled: [...wanted].filter((n) => !active.includes(n)), disabled, bad };
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
    const count = (w.plugins || []).filter((p) => p !== "pi-mcp-adapter").length;
    lines.push(`- **${w.id}** · ${w.title} — ${w.when}${count ? `（${count} 个插件）` : ""}`);
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
      const pkgs = s.plugins;
      const extra = pkgs.filter((p) => p !== "pi-mcp-adapter");
      if (extra.length) {
        for (const pkg of extra) lines.push(`- \`${pkg}\` — ${describePlugin(pi, pkg)}`);
      } else if (!pkgs.includes("pi-mcp-adapter")) {
        lines.push("- 不需要额外插件");
      }
      if (pkgs.includes("pi-mcp-adapter")) lines.push("- `pi-mcp-adapter` — MCP 代理（常驻）");
      const auto = autoAssignedIds(store, s.id).filter((id) => id.startsWith("npm:") && !s.plugins.includes(id.slice(4))).map((id) => id.slice(4));
      if (auto.length) lines.push(`- 自动归入：${summarizeNames(auto)}`);
      const skills = scenarioSkillIds(store, s.id);
      if (skills.length) lines.push(`- 技能 ${skills.length} 个：${summarizeSkills(skills)}（随会话自动加载）`);
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

export function menuOptions(store, scenarios = SCENARIOS) {
  return scenarios.map((s) => {
    const count = scenarioPackages(s, store).filter((p) => p !== "pi-mcp-adapter").length;
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

  const announceProposal = (scenario, reason, workflow) => {
    const head = reason ? `匹配依据：${reason}\n\n` : "";
    pi.sendMessage({
      customType: "function-proposal",
      content: head + buildProposal(pi, scenario, store, workflow),
      display: true,
    });
  };

  const pickWorkflow = async (ctx, recommendedId = null) => {
    const sel = await ctx.ui.select("第 1 步：先选工作流（怎么执行）", workflowOptions(recommendedId));
    if (!sel) return null;
    const id = sel.split(" · ")[0];
    return WORKFLOWS.find((w) => w.id === id) || null;
  };

  const pickTask = async (ctx, ranked = []) => {
    const ordered = ranked.length
      ? [
          ...ranked.map((r) => r.scenario),
          ...SCENARIOS.filter((s) => !ranked.some((r) => r.scenario.id === s.id)),
        ]
      : SCENARIOS;
    const sel = await ctx.ui.select("第 2 步：再选任务场景（做什么）", menuOptions(store, ordered));
    if (!sel) return null;
    const id = sel.split(" · ")[0];
    const pick = SCENARIOS.find((s) => s.id === id) || null;
    if (!pick) return null;
    const hit = ranked.find((r) => r.scenario.id === pick.id);
    return { scenario: pick, reason: hit ? hit.hits.slice(0, 5).join(" / ") || pick.id : "手动选择" };
  };


  const confirmScenario = async (ctx, scenario, reason, workflow) => {
    announceProposal(scenario, reason, workflow);
    const pkgs = comboPackages(scenario, store, workflow).filter((p) => p !== "pi-mcp-adapter");
    const list = pkgs.length ? pkgs.join("、") : "无额外插件";
    const title = workflow ? `${workflow.title} × ${scenario.title}` : scenario.title;
    return ctx.ui.confirm(
      `装配「${title}」？`,
      `工作流：${workflow ? workflow.title : "直接执行"}\n任务：${scenario.title}\n将启用：${list}\n\n确认后只启用工具并注入流程提示，不会自动执行任何需求。`,
    );
  };

  const functionCommand = {
    description: "Pi-function：单独 /function 用工作流 × 场景菜单；带需求文本时动态分析并组合插件/技能",
    getArgumentCompletions: (prefix) => {
      const base = ["scan", "status", "off", "assign"];
      return base.filter((v) => v.startsWith(prefix || "")).map((v) => ({ value: v, label: v }));
    },
    handler: async (rawArgs, ctx) => {
      captureBaseline();
      const args = String(rawArgs || "").trim().replace(/^["'“”]|["'“”]$/g, "");

      if (!args) {
        scan(false);
        pi.sendMessage({ customType: "function-catalog", content: buildCatalog(pi, store), display: true });
        if (!requireUI(ctx)) return;
        const workflow = await pickWorkflow(ctx);
        if (!workflow) return;
        const picked = await pickTask(ctx);
        if (!picked) return;
        const ok = await confirmScenario(ctx, picked.scenario, "菜单选择", workflow);
        if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
        const res = applyScenario(pi, ctx, picked.scenario, store, baseline, workflow);
        activeScenario = picked.scenario;
        activeWorkflow = workflow;
        pi.appendEntry("function-scenario", { id: picked.scenario.id, workflow: workflow.id, at: nowIso(), tools: res.next });
        ctx.ui.notify(`已装配「${workflow.title} × ${picked.scenario.title}」：启用 ${res.enabled.length} 个工具，停用 ${res.disabled.length} 个可选工具`, "info");
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

      if (args === "status") {
        const lines = [];
        lines.push(`当前组合：${activeScenario ? `${activeWorkflow ? activeWorkflow.title + " × " : ""}${activeScenario.title}${activeScenario.dynamic ? "（动态）" : ""}` : "未装配"}`);
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
        saveStore(store);
        ctx.ui.notify(`已把 ${name} 指定到 ${scenarioId}`, "info");
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

      const workflow = await pickWorkflow(ctx, recommended);
      if (!workflow) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
      const scenario = dynamicScenario(args, analysis, workflow);
      const ok = await confirmScenario(ctx, scenario, "按需求动态组合", workflow);
      if (!ok) { ctx.ui.notify("已取消，未做任何改动", "info"); return; }
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
      const restored = typeof ctx.ui.setEditorText === "function";
      if (restored) ctx.ui.setEditorText(args);
      const head = `已按需求组合「${workflow.title} × 动态任务」：${scenario.plugins.length} 个插件、${scenario.skillIds.length} 个技能；启用 ${res.enabled.length} 个工具，停用 ${res.disabled.length} 个可选工具。`;
      ctx.ui.notify(
        restored
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
    activeWorkflow = last.workflow ? WORKFLOWS.find((w) => w.id === last.workflow) || null : null;
    let scenario = null;
    if (last.id === "custom" && last.custom?.need) {
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

  pi.on("before_agent_start", (event) => {
    if (!activeScenario) return;
    const extra = [
      "",
      `## 当前组合（/function 装配）：${activeWorkflow ? activeWorkflow.title + " × " : ""}${activeScenario.title}`,
      activeWorkflow ? `### 工作流：${activeWorkflow.title}\n${activeWorkflow.brief}` : "",
      `### 任务：${activeScenario.title}\n${activeScenario.brief}`,
      (activeWorkflow?.manual?.length || activeScenario.manual?.length)
        ? `仍需手动：${uniq([...(activeWorkflow?.manual || []), ...(activeScenario.manual || [])]).join("；")}`
        : "",
      "只使用当前已启用的工具；缺工具时提示用户运行 /function 重新装配。",
    ].filter(Boolean).join("\n");
    return { systemPrompt: event.systemPrompt + "\n" + extra };
  });
}

// 供测试使用
export { SCENARIOS, WORKFLOWS, PLUGIN_INFO, scoreScenarios, classifyItem, buildCatalog, buildProposal, discoverItems, reconcile, loadStore, saveStore, storePath, scenarioPackages, comboPackages, workflowOptions, recommendWorkflow, matchesPkg, CORE_TOOLS, CLASSIFIER_VERSION, summarizeSkills, coreToolNames, applyScenario, analyzeNeed, dynamicScenario };

<div align="center">
  <img src="assets/banner.svg" alt="Pi-function" width="100%">

  <h1>Pi-function</h1>

  <p><strong>给 Pi coding agent 的场景化插件装配器。</strong><br>
  常开、自动接纳新插件；先给你看清单，你同意后才动手。</p>

  <p>
    <a href="https://github.com/ppTeyven/pi-function/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ppTeyven/pi-function?style=flat-square&color=F1BE58"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/ppTeyven/pi-function?style=flat-square&color=4D9ABF"></a>
    <img alt="Pi extension" src="https://img.shields.io/badge/pi-extension-F09082?style=flat-square">
    <img alt="Node >= 20" src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white">
  </p>

  <p>
    <a href="#安装">安装</a> ·
    <a href="#用法">用法</a> ·
    <a href="#场景">场景</a> ·
    <a href="#装配原理">装配原理</a> ·
    <a href="#自动接纳">自动接纳</a> ·
    <a href="README.md">English</a>
  </p>
</div>

---

把已装的 Pi 插件组织成 **25 个任务场景**。不用再记“这件事该开哪个插件”：说需求，或打开菜单，Pi-function 给出建议清单；你说 **是** 之后才启用。

单文件、零依赖、不联网、无遥测、每次会话自动加载。

## 为什么

插件只在对的场景里有用：subagent 并行适合重构，却会拖累一行 typo；计划评审适合动手前，不适合已经定位好的修复。全开既烧上下文又容易误用工具。

Pi-function 保留目录、匹配需求，并把开关交给你确认。

## 安装

```bash
pi install git:github.com/ppTeyven/pi-function
```

本地开发：

```bash
pi install ./path/to/pi-function
```

也可以直接把 `function-menu.js` 放进 `~/.pi/agent/extensions/`。Pi 启动即加载，**没有额外的启用步骤**。

如果是在已经运行的 Pi 会话里安装，当前会话不会发现它：先执行 `/reload`，或重启 Pi。在此之前 `/function ...` 只是一条普通消息，Pi 会把它交给模型，模型可能直接开始处理需求——未加载的扩展无法拦截。

需要 Node 20+，以及支持扩展命令（`pi.registerCommand`）、工具控制（`pi.setActiveTools`）、技能列表（`pi.getCommands`）的 Pi 版本。

## 用法

| 命令 | 行为 |
|---|---|
| `/function` | 打印 25 个场景全表，然后弹出选择器 |
| `/function <需求>` | 识别需求 → 展示插件、功能、命令 → 等你确认 → 装配（不执行需求） |
| `/function <场景id>` | 直接装配已知场景（仍会先确认） |
| `/function scan` | 重扫插件、本地扩展与技能 |
| `/function status` | 查看当前场景与已启用的插件工具 |
| `/function assign <名称> <场景id\|none\|infra>` | 手动改某个插件/技能的归属 |
| `/function off` | 还原装配前的工具集 |

`/pi-function` 是 `/function` 的别名。

示例：

```text
/function 把整个项目重构一下

## 场景：大重构 / 迁移
**适用**：跨文件重构、换框架、批量机械替换

**将启用的插件与功能**
- `@quintinshaw/pi-dynamic-workflows` — 动态工作流，fan-out 多代理
- `@plannotator/pi-extension` — 浏览器里审计划/代码
- `@juicesharp/rpiv-todo` — 任务清单与进度跟踪
- `pi-simplify` — 审查改动并简化

**装配后仍需手动做**
- /plannotator-plan-mode 审计划
- /workflows run … 批量执行
- /simplify 收尾

[ 是 ]  [ 否 ]
```

只有选“是”才调用 `setActiveTools`；选“否”不做任何改动。装配不会执行需求：选“是”之后，需求文本会被放回输入框，按 Enter 才开始，也可以直接清空。确认框之前还会把完整方案作为一条可见消息打印到会话里，插件清单不会只存在于弹窗中。

## 场景

<details open>
<summary><strong>理解</strong></summary>

| id | 场景 | 何时用 | 主要插件 |
|---|---|---|---|
| `understand` | 看懂代码 / 接手仓库 | 陌生仓库、弄清结构、找逻辑、读遗留代码 | `openwiki`, `pi-lens`, `pi-btw`, `pi-memory`, `pi-web-access` |
| `knowledge` | 知识沉淀 / 团队规范 | 写长期记忆、维护 wiki、记录决策 | `pi-memory`, `openwiki` |
| `docs` | 文档 / Wiki / 交接 | 写 README、维护 wiki、整理交接文档 | `openwiki`, `pi-memory` |

</details>

<details>
<summary><strong>修改</strong></summary>

| id | 场景 | 何时用 | 主要插件 |
|---|---|---|---|
| `small` | 日常小改 | 单文件小修、typo、改文案、加一行日志 | — |
| `bugfix` | 修 bug / 复现报错 | 报错栈、回归、行为不符预期 | `context-mode`, `pi-web-access`, `pi-lens` |
| `feature` | 写新功能 | 从零加功能，需要阶段推进 | `@juicesharp/rpiv-todo`, `pi-lens` |
| `gsd` | GSD 规格驱动 / 阶段推进 | spec、plan、execute、verify、ship 的完整阶段流程 | `@opengsd/gsd-core`, `@juicesharp/rpiv-todo`, `@plannotator/pi-extension` |
| `frontend` | 前端页面 / 视觉实现 | 做页面、组件、样式、响应式与视觉验收 | `@onkernel/browser-loop`, `@getpipher/vision`, `pi-web-access` |
| `refactor` | 大重构 / 迁移 | 跨文件重构、换框架、批量替换 | `@quintinshaw/pi-dynamic-workflows`, `@plannotator/pi-extension`, `@juicesharp/rpiv-todo`, `pi-simplify`, `pi-lens` |
| `tests` | 补测试 / 修 flaky | 覆盖不足、测试不稳、并行分片 | `pi-lens`, `pi-subagents`, `context-mode` |
| `deps` | 依赖升级 | 升级库、修 breaking change、对齐版本 | `pi-web-access`, `pi-lens` |

</details>

<details>
<summary><strong>验证</strong></summary>

| id | 场景 | 何时用 | 主要插件 |
|---|---|---|---|
| `review` | 代码评审 / PR 描述 | 提交前自查、回应 review、写 PR 说明 | `pi-simplify`, `pi-lens`, `pi-subagents`, `@quintinshaw/pi-dynamic-workflows` |
| `plan` | 计划评审 | 动手前要人批准方案 | `@plannotator/pi-extension`, `@juicesharp/rpiv-todo` |
| `research` | 查资料 / 写调研 | 查文档、比对方案、写技术调研 | `pi-web-access`, `pi-memory`, `openwiki`, `pi-subagents`, `@quintinshaw/pi-dynamic-workflows` |
| `data` | 日志 / 性能 / 数据 | 大日志、benchmark、性能剖析、统计 | `context-mode`, `@quintinshaw/pi-dynamic-workflows` |
| `audit` | 安全审计 / 依赖检查 | 漏洞、许可证、危险调用、依赖风险 | `@quintinshaw/pi-dynamic-workflows`, `pi-lens`, `pi-subagents`, `pi-web-access` |
| `webui` | 浏览器 / UI 验收 | 点击流程、截图对比、端到端验收 | `@onkernel/browser-loop`, `@getpipher/vision`, `@plannotator/pi-extension` |

</details>

<details>
<summary><strong>协作</strong></summary>

| id | 场景 | 何时用 | 主要插件 |
|---|---|---|---|
| `parallel` | 多任务并行 / 子代理委派 | 互相独立的模块同时推进 | `pi-subagents`, `@juicesharp/rpiv-todo`, `@quintinshaw/pi-dynamic-workflows` |
| `sideask` | 问一句、不打断主线 | 顺带问问题、查符号、要只读结论 | `pi-btw` |
| `advisor` | 要第二意见 | 方案取舍、架构决策、另一个模型点评 | `pi-advisor-flow` |
| `release` | 发布 / CI 排查 | 合并前检查、CI 失败、打 tag、写 release notes | `pi-simplify`, `@juicesharp/rpiv-todo`, `pi-subagents` |
| `unattended` | 无人值守批处理 | 跑一批任务、长时间自动执行 | `@quintinshaw/pi-dynamic-workflows` |

</details>

<details>
<summary><strong>环境</strong></summary>

| id | 场景 | 何时用 | 主要插件 |
|---|---|---|---|
| `privacy` | 隐私 / 离线 / 省钱 | 敏感仓库、不能外发、token 预算紧 | — |
| `mcp` | MCP / 外部系统集成 | 数据库、第三方 API、企业系统 | `pi-mcp-adapter` |
| `i18n` | 本地化 / 翻译 | 界面语言、文案翻译、多语言 | `@juicesharp/rpiv-i18n`, `pi-web-access` |

</details>

没装的插件在装配时会自动跳过，场景仍然可用。

## 装配原理

- **按路径认领工具。** 工具的 `sourceInfo.path` 位于某包的 `node_modules` 下，就属于该包。插件升级新增的工具无需改代码即可被场景使用。
- **只开场景需要的。** 不属于该场景的可选插件工具会被停用；核心工具（`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`）始终保留，避免场景切换后搜索/列目录消失。
- **MCP 常驻（隐私场景除外）。** `pi-mcp-adapter` 视为基础设施，默认每个场景都保留；`privacy` 场景会显式关闭它。
- **流程提示注入系统提示。** 每个场景带一段操作规则（例如：先复现再修；不要用并行编辑改同一批文件），仅在当前会话生效。
- **不会卸载插件。** Pi 不支持运行时装卸扩展代码。“装配”是工具可见性 + 提示层面的；代码本身常驻。`/function off` 还原装配前的工具集。

当前场景通过 `pi.appendEntry` 记录，并显示在 `/function status`。

## 自动接纳

每个新装的插件和技能都会自动进入目录，无需注册；Pi-function 已加载时，会话开着也无需重启（扩展本身的安装仍需 `/reload` 或重启，见上文）：

1. **会话启动时**扫描 `settings.json` 里的包、Pi 的 npm 树、本地 `extensions/`、独立技能，以及插件自带的技能；即使技能命令尚未注册，也会从 agent / project / GSD / 包目录的 `SKILL.md` 兜底读取。
2. **会话运行期间**监听 `settings.json`、`skills/`、`extensions/`、`node_modules/`，1.5 秒防抖；新装会触发重扫并提示。
3. **归类顺序**：已知包映射（`KNOWN_SCENARIO`）→ 场景强信号词（`SCENARIO_HINTS`）→ 包名/工具名/命令/描述的关键词打分。
4. **没命中的**进入“未分类”，不会硬塞进错误场景。指定一次即可：

```bash
/function assign @scope/package-name refactor
/function assign skill:my-skill knowledge
/function assign leftpad none
```

上下文压缩、安全守卫、主题、遥测、以及本扩展自身这类不参与装配的基础设施，会单列在目录的“常驻”区。

自动归类带版本号：升级后会重新归类由自动分类得到的条目，但保留你手动 `/function assign` 的覆盖。GSD 的 72 个阶段技能会统一归入 `gsd`，目录里只显示数量，不再逐条刷屏。

## 文件

| 路径 | 用途 |
|---|---|
| `function-menu.js` | 全部逻辑：目录、匹配、归类、装配、监听 |
| `test.mjs` | 零依赖回归测试：场景、核心工具、技能映射、迁移、目录摘要 |
| `~/.pi/agent/function-menu.json` | 运行时存储：发现项、归属、覆盖 |
| `assets/banner.svg` | 生成的横幅（官方 Pi 标志 + 白色像素字） |
| `assets/pi-logo.svg` | 官方 Pi 标志，原样取自 [pi.dev/logo-auto.svg](https://pi.dev/logo-auto.svg) |
| `scripts/render-banner.mjs` | 重新生成横幅：`node scripts/render-banner.mjs` |

设置 `PI_CODING_AGENT_DIR` 可改变 agent 目录位置。

## 扩展

在 `function-menu.js` 的 `SCENARIOS` 里追加一项：

```js
{
  id: "perf",
  group: "验证",
  title: "性能优化",
  when: "慢查询、内存涨、启动时间",
  keywords: ["性能", "变慢", "profile", "latency"],
  plugins: ["context-mode", "pi-lens"],
  brief: "先量再改：用 ctx_execute 跑 benchmark ...",
  manual: ["/lens-perf 查看诊断"],
}
```

再为它补 `SCENARIO_HINTS`；如果某已知包需要固定归属，补 `KNOWN_SCENARIO`。其余无需接线。

## 设计约定

- 单文件，零运行时依赖。
- 不联网、不埋点、不 fork shell。
- 归类是确定性的，结果可直接在 `function-menu.json` 里查看。
- 只有命令处理器里的确认分支会装配，没有自动应用路径。
- Windows / macOS / Linux 路径统一走 `node:path`。

## 许可

MIT © 2026 ppTeyven

Pi 标志为 [pi.dev](https://pi.dev) 官方 logo，未做修改。Pi 是 Mario Zechner / Earendil Works 的项目。

<div align="center">
  <img src="assets/banner.svg" alt="Pi-function" width="100%">

  <h1>Pi-function</h1>

  <p><strong>按“应用场景”和工作流装配 Pi 工具。</strong><br>
  场景 ID 固定，能力画像按每台机器自动生成；确认之前不执行任何需求。</p>

  <p>
    <a href="https://github.com/ppTeyven/pi-function/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ppTeyven/pi-function?style=flat-square&color=F1BE58"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/ppTeyven/pi-function?style=flat-square&color=4D9ABF"></a>
    <img alt="Pi extension" src="https://img.shields.io/badge/pi-extension-F09082?style=flat-square">
    <img alt="Node >= 20" src="https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white">
  </p>

  <p>
    <a href="#安装">安装</a> ·
    <a href="#用法">用法</a> ·
    <a href="#应用场景">应用场景</a> ·
    <a href="#工作流">工作流</a> ·
    <a href="#能力画像">能力画像</a> ·
    <a href="README.md">English</a>
  </p>
</div>

---

Pi-function 把你已安装的 Pi 插件组织成**应用场景**：做网页、写文章、做游戏、做报告、做数据图表……单独输入 `/function` 时，先选**怎么执行**（工作流），再选**做什么**（应用场景）。带需求文本时跳过固定场景选择，直接按需求分析出多个应用方向。

场景和工作流的 ID 对每个用户都固定；具体由哪些插件、技能来填充，则**从当前电脑自动识别**，保存在每用户的能力画像里。源码不假设你装了哪套插件。

单文件、常驻、无依赖、无网络请求、无遥测。

## 安装

```bash
pi install git:github.com/ppTeyven/pi-function
```

本地开发：

```bash
pi install ./path/to/pi-function
```

也可以把 `function-menu.js` 放进 `~/.pi/agent/extensions/`。Pi 启动时自动加载。

如果安装时 Pi 会话已经开着，需要 `/reload` 或重启。否则 `/function ...` 会被当作普通提示发给模型，扩展无法拦截。

需要 Node 20+，以及支持 `pi.registerCommand`、`pi.setActiveTools`、`pi.getCommands()` 返回技能的 Pi 版本。

## 用法

| 命令 | 行为 |
|---|---|
| `/function` | 打印场景目录 → 先选工作流 → 再选应用场景 → 确认后装配 |
| `/function <需求>` | 按需求识别多个应用方向 → 只问工作流 → 按能力画像组合插件/技能 → 确认后装配；不打开固定场景选择，也不自动执行需求 |
| `/function scan` | 重新扫描已安装插件、本地扩展和技能，并重建能力画像 |
| `/function status` | 查看当前工作流 × 场景、已启用的插件工具 |
| `/function assign <名称> <场景id\|none>` | 手动覆盖某个插件/技能的绑定 |
| `/function off` | 还原到装配前的工具集 |

`/pi-function` 是别名。

选择器会显示插件数和技能数。典型流程：

```text
/function

第 1 步：先选工作流（怎么执行）
  outline · 结构先行 — ★ 推荐 · 1 个插件
  direct · 直接产出 — 无额外插件
  ...

第 2 步：再选应用场景（做什么）
  webpage · 网页 / 落地页 / 官网 — 2 个插件 · 3 技能（frontend-design、...）
  ...

## 装配：结构先行 × 网页 / 落地页 / 官网
**工作流**：先给出结构/目录/页面清单，确认后再产出
**场景**：官网、落地页、营销页、响应式页面

**将启用的插件与功能**
- ... — 能力描述、工具、命令、技能
...
```

只有点 **Yes** 才会调用 `setActiveTools`。点 **No** 不改动任何东西。确认后，带需求文本的模式会把需求放回输入框，按 Enter 才开始。

## 应用场景

场景是“最终要做出什么”，不是“用什么工程动作”。

| 分组 | ID | 要做的产物 |
|---|---|---|
| 内容 | `article` | 文章、文案、博客、公众号 |
| 内容 | `email` | 邮件、通知、邀请函、营销邮件 |
| 内容 | `social` | 小红书、微博、推特、种草与运营文案 |
| 内容 | `novel` | 小说、故事、剧本、角色与世界观 |
| 内容 | `video` | 视频脚本、播客、分镜、字幕 |
| 内容 | `music` | 歌词、歌曲结构、配乐方向 |
| 内容 | `course` | 课程、教学、课件、培训 |
| 内容 | `resume` | 简历、求职、面试、作品集 |
| 内容 | `event` | 活动、旅行、婚礼与生活策划 |
| 内容 | `report` | 报告、调研、白皮书、方案 |
| 内容 | `presentation` | 演示、PPT、路演 |
| 内容 | `docs` | 文档、教程、知识库、交接 |
| 内容 | `legal` | 合同、条款、隐私政策、合规说明 |
| 产品 | `webpage` | 网页、落地页、官网 |
| 产品 | `webapp` | Web 应用、管理后台、SaaS |
| 产品 | `commerce` | 电商、商品页、店铺、结算 |
| 产品 | `dashboard` | 仪表盘、BI、报表、指标监控 |
| 产品 | `mobile` | App、小程序、移动端 |
| 产品 | `game` | 游戏、互动体验、小游戏 |
| 视觉 | `design` | 视觉设计、品牌、UI 稿 |
| 视觉 | `image` | 海报、封面、插图、配图 |
| 视觉 | `data` | 数据、图表、分析结果 |
| 视觉 | `spreadsheet` | 表格、Excel、公式、对账 |
| 系统 | `api` | API、后端、CLI、SDK |
| 系统 | `automation` | 自动化、爬虫、定时任务 |
| 系统 | `tool` | 小工具、脚本、命令行、格式转换 |
| 系统 | `integration` | 集成、MCP、外部系统 |
| 系统 | `chatbot` | AI 对话、知识库问答、客服机器人 |
| 系统 | `plugin` | Pi 插件、扩展、工具 |
| 维护 | `maintain` | 维护现有项目、修 bug、重构、测试 |
| 维护 | `localization` | 本地化、翻译、多语言 |
| 通用 | `general` | 其他任务 |

## 工作流

工作流决定执行方式；应用场景再补充领域能力。重复的插件会合并。

| id | 工作流 | 适用 |
|---|---|---|
| `direct` | 直接产出 | 目标明确的小任务，不需要额外流程 |
| `outline` | 结构先行 | 先列结构/目录/页面清单，再产出 |
| `prototype` | 原型先行 | 视觉或交互产物，先做可看的原型 |
| `parallel` | 并行探索 | 可独立拆分的多个部分同时推进 |
| `review-gate` | 评审守门 | 交付前要独立评审 |
| `phased` | 阶段推进 | 多阶段、需要规格/计划/验收 |
| `offline` | 隐私 / 离线 | 不外发任何内容，排除网络能力 |

## 能力画像

首次加载和每次扫描时，Pi-function 会读取：

- 已安装的 npm 插件；
- 本地扩展；
- 已注册的工具、命令；
- 技能名称与描述。

然后按通用能力角色（代码理解、网页、写作、设计、子代理、任务跟踪、浏览器、视觉、记忆、文档、发布、测试等）打分，写入：

```text
~/.pi/agent/function-menu.profile.json
```

画像包含“角色 → 插件/技能”的绑定、描述和指纹。新装插件或技能会改变指纹，触发自动重建。这个文件属于当前用户，不应提交到仓库。

场景目录在运行时从画像填充，所以同一个 `webpage`、`article` ID 在不同电脑上可以使用完全不同的工具，而扩展源码不变。

手动覆盖保存在 `~/.pi/agent/function-menu.json`，重建画像时不会丢失。

## 动态需求

`/function "做一个产品官网，并写一篇发布文章"` 不会强行选一个场景。它会：

1. 识别多个应用方向（例如 `webpage` + `article`）；
2. 从画像中收集匹配的能力角色、插件和技能；
3. 只询问工作流；
4. 展示组合并等待确认。

如果一个场景都没命中，也会按能力给出组合，而不是拒绝。需求文本永远不会自动发送。

## 装配会改变什么

- 启用所选插件的工具；
- 保留核心工具（`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`）；
- 停用其他插件的可选工具；
- 把工作流和应用场景的流程注入系统提示；
- 不卸载插件代码，只切换当前会话的工具集。

## 开发

```bash
npm test
```

测试会用合成能力画像验证：相同 ID 在不同插件集下解析出不同绑定、动态多意图分析、核心工具保留，以及两步选择流程。

## License

MIT

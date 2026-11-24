# /function 分配系统 · 测试计划（v1）

下文 G1–G8 为设计目标，不是本次实测指标。当前可长期重跑的验证只有 `npm test`（`tests/*.test.mjs`）；宿主集成、并发竞态等验收脚本按需临时编写，不存入仓库。

依据：`@clawhub_aiweline/qa`（分层验证 + 风险驱动 + 门禁/证据）与 `@org-b6kzcl68/testcase-generator`（等价类/边界值/判定表/场景法/状态转换 + 覆盖缺口审核）。

被测对象：`function-menu.js`（本仓库根目录）
- `analyzeNeed()` 需求 → 插件/技能组合
- `auditCoverage()` 与 `SCENARIO_CONTRACTS` 契约
- `comboScenarios()` / `comboWorkflows()` / `pickMany()` 多选
- `/function` handler 与 store 持久化

## 1. 风险分类（决定测试深度）

| 编号 | 风险 | 影响 | 深度 |
|---|---|---|---|
| R1 | 误分配：无关插件/技能进入组合 | 直接违背产品目标，高频 | P0，金标准 + 断言 |
| R2 | 漏用：required 能力未覆盖 | 用户明确要求"不漏用" | P0，100% 硬门禁 |
| R3 | 数据破坏：扫描把目录标成 missing 并写盘 | 已真实发生过一次 | P0，字节级不变性 |
| R4 | 多选/组合边界错乱（未知 id、叠加超限、取消） | 状态错乱 | P1，场景法 |
| R5 | 判定不确定（同分、阈值附近） | 结果不可复现 | P1，确定性 |
| R6 | 性能退化（每次需求分析放大） | 体验 | P2，耗时门禁 |

## 2. 测试分层（qa：分层验证）

| 层 | 对象 | 方法 |
|---|---|---|
| L1 单元 | `termScoreDistinct`、`contractFor`、`auditCoverage`、`combo*` | 等价类 + 边界值 + 判定表 |
| L2 集成 | `analyzeNeed` → `buildProposal` | 金标准集（33 场景）+ 指标门禁 |
| L3 不变量 | 预算、覆盖、确定性、只读 | 属性断言 |
| L4 持久化 | `scan()` / `reconcile()` | 状态转换 + 字节比对 |
| L5 端到端 | handler（桩 pi/ctx） | 场景法（主流程 + 备选流） |

## 3. 判定表：`auditCoverage` 的状态映射

| 具体场景命中 | required 有条目 | required 已入选 | 期望 kind |
|---|---|---|---|
| Y | Y | Y | `ok`（missing 为空） |
| Y | Y | N | `not-selected` |
| Y | N | — | `not-installed` |
| N（仅 general） | — | — | `ok`（无硬要求） |

边界：score 恰为 1.5（`wantedRoles` 阈值）、2.0（`strongIntent`）、名额 5/6、叠加 3/4。

## 4. 验收门禁（可量化，全部为硬性）

| 门禁 | 指标 | 阈值 |
|---|---|---|
| G1 | required 覆盖率（已装前提） | 100% |
| G2 | forbidden 命中 | 0 |
| G3 | 动态组合 precision（relevant = 契约 required∪optional 角色成员） | ≥ 0.80 |
| G4 | 金标准意图识别命中率（33 条） | 100% |
| G5 | 预算：packages ≤ 5 且 skills ≤ 5 | 硬约束 |
| G6 | 确定性：同输入两次 `JSON.stringify` 结果相同 | 100% |
| G7 | 只读路径调用前后 store 文件 SHA-256 不变 | 100% |
| G8 | `analyzeNeed` 平均耗时（182 条目录） | < 20 ms |

未达标即不发布；`KNOWN_GAPS`（data / automation 未装）不计入 G1，但必须报 `not-installed`。

## 5. 退出标准

- 上述 8 条门禁全绿
- 任何新增场景必须同时提交：契约 + 3 条金标准需求（否则测试失败）
- 每轮改动后跑 `npm test`；涉及会话上下文、工具状态或恢复时，再跑 SDK 集成检查。
- 项目入口对照：`resume` 与带需求文本必须报告相同项目证据和进度；后者额外分析需求。两者取消或无确认 UI 时都不切换工具；仅确认提案并核对缺口后装配。

## 6. 测试归属与去重规则

- 同一入口、输入和初始状态，合并为一次操作并核对所有相关结果。独立边界用具名表格保留，失败时能定位到具体输入；不为减少测试数字而少跑矩阵。
- 对外行为优先：对照宿主的实际工具、会话条目、磁盘读回、用户可见报告或模型收到的提示。不要用源码正则、空断言、只判类型或只判“不崩”代替这些结果。
- 保留必要的跨层验证：例如补全算法有直接用例，公共装配矩阵负责证明入口真的应用它；只是换一种入口重复核对同一字段，不另加测试。

| 主要契约 | 优先维护的用例 |
|---|---|
| 实际装配差集与幂等、多选契约 | `tests/enable-28-properties.test.mjs`：完整 34 × 9 固定组合，加 40 组多选 |
| 确认、取消与能力岔路 | `tests/enable-06-words-and-cancel.test.mjs`、`tests/enable-14-project-context.test.mjs` |
| 工具真实启用、能力补全与宿主默认工具 | `tests/enable-19-no-miss.test.mjs`、`tests/enable-21-off-keeps-bash.test.mjs` |
| 磁盘往返、项目/会话隔离、旧计数不复活 | `tests/enable-25-state.test.mjs`、`tests/enable-26-silent-paths.test.mjs`、`tests/enable-29-contracts.test.mjs` |
| 项目证据、提案/回执和提示注入 | `tests/enable-14-project-context.test.mjs`、`tests/enable-24-injection.test.mjs`、`tests/enable-27-project.test.mjs` |

### 本轮整合验证

- `npm test`：666 → **495**，0 失败；包与工作流矩阵、异常输入和确认分支仍执行。
- `node --test --experimental-test-coverage --test-coverage-include=function-menu.js "tests/*.test.mjs"`：行 96.14% → 96.59%，分支 82.97% → 84.24%，函数 88.38% → 89.72%。按未覆盖行集合比对，原已命中行没有丢失，新增 22 行。覆盖率不是断言正确性的替代品，也不是 G3/G4 的验证结果。
- 临时突变检查：故意破坏缺口取消、非内置 bash 保留、关闭前落盘、30 天清理、跨会话恢复防护、清零后旧计数保护，六项均触发各自的回归用例。临时副本不保留。
- 另发现现有持久化问题：写入 `wfUsage: { debug: 2 }` 后，`loadStore()` → `saveStore()`（无 reset）会将其变成 `{}`。本轮未改生产代码；统计命令测试将命令效果与前置扫描写盘隔离，不能当成此问题已修。

## 7. G3 / G4 金标准集采集方案（尚未采集）

1. **先收原话，再贴标签。** 从用户自愿提供、明确允许用于评测的真实需求开始，脱敏后保留能影响意图的上下文。用公开 issue 或维护者独立撰写的案例补齐多意图、中英、相近类别、缺能力和证据不足等缺口；不批量读取私人会话，不按现有关键词表反写需求。33 条可作首批门禁集，不代表覆盖全部场景。
2. **先标答案，再跑分类器。** 两名标注者分别依据需求、项目上下文和场景契约，不看任何模型或分类器输出。G4 标主意图；确实存在多个等价答案的样例事先记录可接受集合，需澄清的单独标记。G3 标必需、可选和不应启用的能力角色；冻结插件/技能目录与角色成员表。冲突先仲裁后冻结，保留理由。
3. **验收集与调优集隔离。** 同一任务的改写、同一 issue 及类似模板不跨组。冻结输入、标签和目录版本后再跑：G3 统计被选条目里属于人工标注相关角色的比例，并单列零选和必需能力缺失，避免少选刷高精度；G4 按预先认可的标签计命中，歧义/待澄清的表现单列。旧门禁阈值不因跑分结果而改。

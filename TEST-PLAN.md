# /function 分配系统 · 测试计划（v1）

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
- 每轮改动后跑 `node --experimental-strip-types --test function-menu-tests/allocation.test.mjs`

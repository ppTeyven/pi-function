// 第 28 组：属性测试 —— 随机组合下的装配不变量（20）
// 不针对具体输入，只断言“无论怎么组合都必须成立”的规则。
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });

/* 固定种子的伪随机：失败可复现 */
let seed = 20261124;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function makeEnv() {
  const tools = [
    ...coreTools(),
    ...pkgTools("pi-lens", ["lens_a", "lens_b"]),
    ...pkgTools("pi-test", ["test_a"]),
    ...pkgTools("other", ["other_a"]),
  ];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { pi, state, tools };
}

/** 随机生成一组（场景, 工作流） */
function randomCase() {
  const n = 1 + Math.floor(rnd() * 3); // 1-3 个场景
  const picked = Array.from({ length: n }, () => ({ ...pick(m.SCENARIOS) }));
  const scenario = picked.length > 1 ? m.comboScenarios(picked) : picked[0];
  const useWf = rnd() > 0.25;
  const wfs = useWf ? Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => m.workflowById(pick(m.WORKFLOWS).id)) : [];
  const workflow = wfs.length ? m.comboWorkflows(wfs) : null;
  return { scenario, workflow };
}

const CASES = Array.from({ length: 40 }, randomCase);

/* ---------------- 核心不变量 ---------------- */
test("属性：core 工具永远在 next 里", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    for (const c of m.CORE_TOOLS) {
      if (pi.getAllTools().some((t) => t.name === c)) {
        assert.ok(res.next.includes(c), `${scenario.id}: 丢了 ${c}`);
      }
    }
  }
});

test("属性：next 里不出现未注册的工具名", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state, tools } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    const known = new Set(tools.map((t) => t.name));
    for (const n of res.next) assert.ok(known.has(n), `${scenario.id}: 幽灵工具 ${n}`);
  }
});

test("属性：next 无重复", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    assert.equal(res.next.length, new Set(res.next).size, scenario.id);
  }
});

test("属性：disabled 与 next 互斥", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    for (const d of res.disabled) assert.ok(!res.next.includes(d), `${scenario.id}: ${d} 同时被启用和停用`);
  }
});

test("属性：disabled 都是可选来源的工具", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    for (const d of res.disabled) {
      const t = pi.getAllTools().find((x) => x.name === d);
      assert.equal(m.isOptionalSource(t.sourceInfo), true, `${scenario.id}: ${d} 不是可选来源却被停用`);
    }
  }
});

test("属性：enabled 都是 next 的子集", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    for (const e of res.enabled) assert.ok(res.next.includes(e), `${scenario.id}: ${e}`);
  }
});

test("属性：store.active.tools 与实际写入一致", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const store = emptyStore();
    m.applyScenario(pi, makeCtx(state), scenario, store, workflow);
    assert.deepEqual(store.active.tools, state.active, scenario.id);
  }
});

test("属性：连续两次装配结果一致（幂等）", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    const first = [...state.active].sort();
    m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    assert.deepEqual([...state.active].sort(), first, scenario.id);
  }
});

test("属性：任意组合都不抛异常", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    assert.doesNotThrow(() => m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow), scenario.id);
  }
});

test("属性：装配后 active 非空（至少有 core）", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    assert.ok(state.active.length > 0, scenario.id);
  }
});

/* ---------------- 组合与覆盖 ---------------- */
test("属性：组合的 required 是各场景 required 的并集", () => {
  for (const { scenario } of CASES) {
    if (!scenario.comboIds) continue;
    const merged = m.contractFor(scenario).required;
    for (const id of scenario.comboIds) {
      for (const r of m.contractFor({ id }).required) assert.ok(merged.includes(r), `${id}.${r}`);
    }
  }
});

test("属性：coverage.missing 里不会出现已补全的角色", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    const added = new Set(res.autoRoles || []);
    for (const miss of res.coverage.missing) {
      assert.ok(!added.has(miss.need), `${scenario.id}: ${miss.need} 已补全却仍报缺`);
    }
  }
});

test("属性：autoAdded 里的包都能在工具集里找到对应工具", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    for (const pkg of res.autoAdded.filter((x) => !x.startsWith("skill:"))) {
      const hit = pi.getAllTools().some((t) => m.matchesPkg(t.sourceInfo, pkg));
      assert.ok(hit, `${scenario.id}: 补了 ${pkg} 但没有对应工具`);
    }
  }
});

test("属性：store.recent 每次都更新到当前场景", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const store = emptyStore();
    m.applyScenario(pi, makeCtx(state), scenario, store, workflow);
    assert.equal(store.recent.scenario, scenario.id, scenario.id);
    assert.equal(store.recent.workflow, workflow?.id || null);
  }
});

test("属性：提案文本对任意组合都非空且含还原入口", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi } = makeEnv();
    const text = m.buildProposal(pi, scenario, emptyStore(), workflow);
    assert.ok(text.length > 20, scenario.id);
    assert.match(text, /还原 \/function off/);
  }
});

test("属性：审计结果对任意组合都返回数组且状态合法", () => {
  const valid = new Set(["ok", "warn", "inactive", "absent"]);
  for (const { scenario, workflow } of CASES) {
    const { pi } = makeEnv();
    const rows = m.auditPackages(pi, scenario, emptyStore(), workflow);
    assert.ok(Array.isArray(rows));
    for (const r of rows) assert.ok(valid.has(r.state), `${scenario.id}: 非法状态 ${r.state}`);
  }
});

test("属性：组合的 id 由各场景 id 用 + 连接", () => {
  for (const { scenario } of CASES) {
    if (!scenario.comboIds) continue;
    assert.equal(scenario.id, scenario.comboIds.join("+"));
  }
});

test("属性：工作流组合的 steps 是并集且无重复", () => {
  for (const { workflow } of CASES) {
    if (!workflow?.steps) continue;
    assert.equal(workflow.steps.length, new Set(workflow.steps).size);
  }
});

test("属性：任意组合下 toolsForScenario 的结果都在 next 里", () => {
  for (const { scenario, workflow } of CASES) {
    const { pi, state } = makeEnv();
    const wanted = m.toolsForScenario(pi, scenario, emptyStore(), workflow);
    const res = m.applyScenario(pi, makeCtx(state), scenario, emptyStore(), workflow);
    for (const w of wanted) assert.ok(res.next.includes(w), `${scenario.id}: 想启用的 ${w} 不在 next`);
  }
});

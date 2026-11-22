// 启用验证 · 第 2 组：applyScenario 真的改写了工具集（什么被调起、什么被关掉）
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, builtinInfo, npmInfo,
  hydrate, scenario, workflow, emptyStore, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

const CORE_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"];

/**
 * 标准环境：核心工具 + pi-lens（相关）+ rpiv-todo（无关）+ 一个 builtin 额外工具。
 * 默认初始 active **只含核心工具与 builtin**，插件工具一律先关着 —— 否则「启用」
 * 断言在「工具本来就在 active」时会假通过（变异测试抓不到）。
 */
function env({ activeExtra = [] } = {}) {
  const tools = [
    ...coreTools(),
    ...pkgTools("pi-lens", ["lens_diagnostics", "lens_check"]),
    ...pkgTools("@juicesharp/rpiv-todo", ["todo"]),
    tool("web_search", builtinInfo("web_search")),
  ];
  const active = [...CORE_NAMES, "web_search", ...activeExtra];
  const { pi, state } = makePi({ tools, active });
  const ctx = makeCtx(state);
  return { tools, pi, state, ctx };
}

function lensOnlyProfile() {
  return hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
}

test("applyScenario：装配后 setActiveTools 被调用且只调用一次", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.equal(state.setCalls.length, 1);
});

test("applyScenario：7 个核心工具在装配后仍然可用", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  for (const core of m.CORE_TOOLS) {
    assert.ok(state.active.includes(core), `核心工具 ${core} 被误停用`);
  }
});

test("applyScenario：场景插件的工具被真正启用", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  const res = m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.ok(state.active.includes("lens_diagnostics"), "pi-lens 的工具必须进 active");
  assert.ok(state.active.includes("lens_check"));
  assert.ok(res.next.includes("lens_diagnostics"), "返回的 next 与实际写入必须一致");
});

test("applyScenario：无关插件的可选工具被真正停用", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env({ activeExtra: ["todo"] });
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.ok(!state.active.includes("todo"), "rpiv-todo 不在本场景，必须被关掉");
});

test("applyScenario：disabled 精确报告被关掉的可选工具", () => {
  lensOnlyProfile();
  const { pi, ctx } = env({ activeExtra: ["todo"] });
  const res = m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.deepEqual(res.disabled.sort(), ["todo"]);
});

test("applyScenario：enabled 只报告本次新增的工具（原本没激活的）", () => {
  lensOnlyProfile();
  const { pi, ctx } = env();
  const res = m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.deepEqual(res.enabled.sort(), ["lens_check", "lens_diagnostics"]);
});

test("applyScenario：核心工具即使装配前被关掉，也会被强制加回", () => {
  lensOnlyProfile();
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  // 模拟上一次装配把 grep/find/ls 关掉了（历史 bug 或手动关闭）
  const { pi, state } = makePi({ tools, active: ["read", "bash", "edit", "write"] });
  m.applyScenario(pi, makeCtx(state), scenario(m, "plugin"), emptyStore());
  for (const core of m.CORE_TOOLS) {
    assert.ok(state.active.includes(core), `核心工具 ${core} 没有被加回来`);
  }
});

test("applyScenario：写入的工具名必须都真实存在（防拼写/前缀错导致工具凭空消失）", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  const known = new Set(pi.getAllTools().map((t) => t.name));
  const ghosts = state.active.filter((n) => !known.has(n));
  assert.deepEqual(ghosts, [], `setActiveTools 收到了不存在的工具名：${ghosts}`);
});

test("applyScenario：builtin 的非核心工具永不被关掉（keep 语义）", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.ok(state.active.includes("web_search"), "builtin 工具不是可选源，不能被 /function 停用");
});

test("applyScenario：store.active.tools 与实际写入的工具集完全一致", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  const store = emptyStore();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), store);
  assert.deepEqual(store.active.tools, state.active);
});

test("applyScenario：store.active.id 记录场景 id，workflow 单独记录", () => {
  lensOnlyProfile();
  const { pi, ctx } = env();
  const store = emptyStore();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), store, workflow(m, "debug"));
  assert.equal(store.active.id, "plugin");
  assert.equal(store.active.workflow, "debug");
});

test("applyScenario：组合场景的 id 用 + 连接", () => {
  lensOnlyProfile();
  const { pi, ctx } = env();
  const store = emptyStore();
  const combo = { ...scenario(m, "plugin"), id: "plugin+docs", comboIds: ["plugin", "docs"], plugins: ["pi-lens"] };
  m.applyScenario(pi, ctx, combo, store);
  assert.equal(store.active.id, "plugin+docs");
});

test("applyScenario：连续装配两次结果幂等（不会越装越多工具）", () => {
  lensOnlyProfile();
  const { pi, state, ctx } = env();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  const first = [...state.active].sort();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  assert.deepEqual([...state.active].sort(), first);
});

test("applyScenario：工作流追加的插件工具真的被启用", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const tools = [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  const sc = { ...scenario(m, "plugin"), plugins: ["pi-lens"] };
  m.applyScenario(pi, makeCtx(state), sc, emptyStore(), { id: "w", plugins: ["pi-test"], skills: [] });
  assert.ok(state.active.includes("test_run"), "工作流带的插件工具必须进 active");
});

test("applyScenario：装机缺失（absent）的插件会给出 warning，不静默", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  // pi-test 在场景里，但一个工具都没注册
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  const ctx = makeCtx(state);
  m.applyScenario(pi, ctx, scenario(m, "plugin"), emptyStore());
  const text = noticeText(state);
  assert.match(text, /需要留意/, "应提示场景中有插件不可用");
  assert.match(text, /pi-test/);
});

test("applyScenario：record:false 时不写使用计数（只改工具集）", () => {
  lensOnlyProfile();
  const { pi, ctx } = env();
  const store = emptyStore();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), store, null, { record: false });
  assert.deepEqual(store.usage, {}, "record:false 不得写 usage（不得新增计数）");
  assert.ok(store.active, "但仍要持久化当前装配，供 /reload 恢复");
});

test("applyScenario：装配会写使用计数 usage（供下次加权）", () => {
  lensOnlyProfile();
  const { pi, ctx } = env();
  const store = emptyStore();
  m.applyScenario(pi, ctx, scenario(m, "plugin"), store, null);
  assert.ok(store.usage?.plugin?.["pi-lens"] >= 1, "pi-lens 应被记一次使用");
});

test("applyScenario：ctx 为空时不抛异常（无 UI 模式）", () => {
  lensOnlyProfile();
  const { pi } = env();
  assert.doesNotThrow(() => m.applyScenario(pi, null, scenario(m, "plugin"), emptyStore(), []));
});

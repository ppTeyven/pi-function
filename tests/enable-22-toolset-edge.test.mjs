// 第 22 组：工具集形态与 setActiveTools 边界（25）
// 重点：真实 pi 里工具的 sourceInfo 形态各不相同，不能靠单一假设判断归属。
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, tool, builtinInfo, npmInfo, localInfo,
  hydrate, emptyStore, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"], skills: ["pi-lens-lsp"] } });

const sc = (over = {}) => ({ id: "plugin", title: "插件", plugins: [], skillIds: [], ...over });

/* ---------------- sourceInfo 归属（6） ---------------- */
test("归属：builtin 工具永不算可选", () => {
  assert.equal(m.isOptionalSource(builtinInfo("bash")), false);
});

test("归属：node_modules 算可选", () => {
  assert.equal(m.isOptionalSource(npmInfo("pi-lens")), true);
});

test("归属：本地扩展算可选", () => {
  assert.equal(m.isOptionalSource(localInfo("function-menu.js")), true);
});

test("归属：matchesPkg 支持 local: 前缀", () => {
  assert.equal(m.matchesPkg(localInfo("function-menu.js"), "local:function-menu"), true);
});

test("归属：matchesPkg 支持 source=npm:x 但路径无关", () => {
  assert.equal(m.matchesPkg({ path: "/nowhere/x.js", source: "npm:pi-lens", scope: "user", origin: "package" }, "pi-lens"), true);
});

test("归属：作用域包不串台（@a/x vs @b/x）", () => {
  assert.equal(m.matchesPkg(npmInfo("@a/x"), "@b/x"), false);
});

/* ---------------- off / 全局常开（5） ---------------- */
function offEnv(settings = {}) {
  const tools = [
    ...coreTools(),
    { name: "bash", description: "", sourceInfo: { path: "/x/shell.js", source: "npm:@agegr/pi-web" } },
    ...pkgTools("pi-lens", ["lens_diagnostics"]),
    tool("ext_tool", localInfo("function-menu.js")),
  ];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name), settings });
  m.default(pi);
  return { pi, state, tools, run: (a, o) => state.commands.get("function").handler(a, makeCtx(state, o || {})) };
}

test("off：插件与本地扩展工具都被关掉", async () => {
  const { state, run } = offEnv();
  await run("off");
  assert.ok(!state.active.includes("lens_diagnostics"));
  assert.ok(!state.active.includes("ext_tool"));
});

test("off：bash（非 builtin 注册）保留", async () => {
  const { state, run } = offEnv();
  await run("off");
  assert.ok(state.active.includes("bash"));
});

test("off：defaultTools 用 +name 追加", async () => {
  const { state, run } = offEnv({ defaultTools: ["+ext_tool"] });
  await run("off");
  assert.ok(state.active.includes("ext_tool"), "显式 + 的工具应在常开里");
});

test("off：defaultTools 用 plain 列表时完全按配置", async () => {
  const { state, run } = offEnv({ defaultTools: ["read", "bash"] });
  await run("off");
  assert.deepEqual([...state.active].sort(), ["bash", "read"]);
});

test("off：写 null 墓碑并清 active", async () => {
  const { state, run } = offEnv();
  await run("plugin", { confirms: [true] });
  await run("off");
  assert.equal(state.entries.at(-1).d.id, null);
});

/* ---------------- 装配 keep/core/wanted（6） ---------------- */
test("装配：active 为空时依然得到核心工具", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: [] });
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  for (const c of m.CORE_TOOLS) assert.ok(state.active.includes(c), c);
});

test("装配：builtin 非核心工具（如 web_search）不被关掉", () => {
  const tools = [...coreTools(), tool("web_search", builtinInfo("web_search")), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  assert.ok(state.active.includes("web_search"));
});

test("装配：setActiveTools 只调用一次", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools });
  m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(state.setCalls.length, 1);
});

test("装配：next 里没有重复工具名", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a", "a"])];
  const { pi, state } = makePi({ tools });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(res.next.length, new Set(res.next).size);
});

test("装配：disabled 只包含被关掉的可选工具", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"]), ...pkgTools("other", ["b"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.deepEqual(res.disabled, ["b"]);
});

test("装配：全部工具都是可选时只剩核心", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"]), ...pkgTools("other", ["b"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  const core = new Set(m.CORE_TOOLS);
  assert.ok(state.active.every((n) => core.has(n)), `残留可选工具：${state.active.filter((n) => !core.has(n))}`);
});

/* ---------------- 补全边界（4） ---------------- */
test("补全：只补 required 角色，不动 optional", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, "testing": { packages: ["pi-test"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"]), ...pkgTools("pi-test", ["b"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.ok(res.autoAdded.includes("pi-lens"), "code-intel 是 required");
  assert.ok(!res.autoAdded.includes("pi-test"), "testing 不是 required，不该自动补");
});

test("补全：autoAdded 不重复", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.equal(res.autoAdded.length, new Set(res.autoAdded).size);
});

test("补全：roleMembers 对未知角色返回空数组", () => {
  assert.deepEqual(m.roleMembers("no-such-role"), []);
});

test("补全：装配返回的 coverage 结构完整", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  for (const k of ["ok", "required", "present", "missing", "forbiddenHit"]) {
    assert.ok(k in res.coverage, `coverage 缺 ${k}`);
  }
});

/* ---------------- 审计三态（4） ---------------- */
test("审计：只有命令的插件算 ok", () => {
  const { pi } = makePi({
    tools: [],
    commands: [{ name: "x", source: "extension", sourceInfo: npmInfo("pi-lens") }],
  });
  const [row] = m.auditPackages(pi, sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(row.state, "ok");
});

test("审计：工具停用但有技能 → warn", () => {
  const { pi } = makePi({
    tools: pkgTools("pi-lens", ["a"]),
    commands: [{ name: "skill:s", source: "skill", sourceInfo: npmInfo("pi-lens", "skills/s/SKILL.md") }],
    active: [],
  });
  const [row] = m.auditPackages(pi, sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(row.state, "warn");
});

test("审计：工具停用且无替代 → inactive", () => {
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["a"]), active: [] });
  const [row] = m.auditPackages(pi, sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.equal(row.state, "inactive");
});

test("审计：场景无插件时返回空数组", () => {
  const { pi } = makePi({ tools: coreTools() });
  assert.deepEqual(m.auditPackages(pi, sc(), emptyStore()), []);
});

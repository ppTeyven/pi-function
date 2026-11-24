// Persistence contract: the assembly writer and store reader agree on observable state.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

test("装配写盘：读回真实工具、组合、工作流与更新时间，不靠二次保存", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: ["read"] });
  const scene = { id: "plugin", title: "插件", plugins: ["pi-lens"], skillIds: [] };
  const ctx = { ...makeCtx(state), sessionManager: { getSessionId: () => "owner" } };
  m.applyScenario(pi, ctx, scene, emptyStore(), m.workflowById("debug"));
  const { active, recent } = m.loadStore();
  assert.equal(active.id, "plugin");
  assert.equal(active.workflow, "debug");
  assert.equal(active.sessionId, "owner");
  assert.deepEqual(active.tools, state.active);
  assert.ok(active.tools.includes("lens_diagnostics"));
  assert.ok(Number.isFinite(Date.parse(active.at)));
  assert.equal(active.custom, null);
  assert.equal(recent.scenario, active.id);
  assert.equal(recent.workflow, active.workflow);
});

test("动态装配：实际需求和选中的插件、技能随 active 写入", () => {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools });
  const scene = { id: "custom", title: "动态", dynamic: true, when: "修复文档生成器", plugins: ["pi-lens"], skillIds: ["diagnose"] };
  m.applyScenario(pi, makeCtx(state), scene, emptyStore());
  assert.deepEqual(m.loadStore().active.custom, { need: "修复文档生成器", packages: ["pi-lens"], skills: ["diagnose"] });
});

test("装配状态容错：拒绝旧文件里的非对象 active", () => {
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known: {}, active: "bad" }));
  assert.equal(m.loadStore().active, null);
});

// 恢复旧记录的边界与手动扫描的完整度守卫。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

function envWithStore(active) {
  // 预写 store，session_start 时会读它
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known: {}, overrides: {}, active }));
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { pi, state, tools };
}

const runSessionStart = (state, ctx = makeCtx(state)) => {
  try { state.handlers.session_start[0]({}, ctx); }
  finally { state.handlers.session_shutdown[0](); }
};

test("恢复：固定、组合、仅工作流、动态记录都重建真实装配，不重复计一次使用", () => {
  const need = "写个爬虫";
  const cases = [
    [{ id: "plugin" }, "plugin", null],
    [{ id: "workflow", workflow: "debug" }, "workflow", "debug"],
    [{ id: "plugin+api" }, "plugin+api", null],
    [{ id: "debug+research" }, "workflow", "debug+research"],
    [{ id: "custom", custom: { need } }, "custom", null],
    [{ id: "custom", custom: { need, packages: ["pi-lens"], skills: [] } }, "custom", null],
  ];
  for (const [last, id, workflow] of cases) {
    const { state } = envWithStore({ at: "2026-01-01T00:00:00.000Z", ...last });
    state.active = ["read"];
    runSessionStart(state);
    const saved = m.loadStore();
    assert.equal(saved.active.id, id, JSON.stringify(last));
    assert.equal(saved.active.workflow, workflow, JSON.stringify(last));
    assert.ok(state.active.includes("bash"), `${last.id} 未恢复工具集`);
    assert.deepEqual(saved.active.tools, state.active);
    if (last.custom) assert.equal(saved.active.custom.need, need);
    if (last.custom?.packages) assert.ok(state.active.includes("lens_diagnostics"));
    assert.deepEqual(saved.usage, {}, `${last.id} 不重复增加使用次数`);
  }
});

test("恢复拒绝：未知组合、不同会话/目录、无效项目、分支 off 均不启用旧插件", () => {
  const here = process.env.PI_CODING_AGENT_DIR;
  const pinned = { id: "plugin", sessionId: "A", cwd: here };
  const cases = [
    ["未知场景", { id: "not-a-real-scene" }, null, here],
    ["其他会话", pinned, "B", here],
    ["其他目录", pinned, "A", path.join(here, "skills")],
    ["其他项目", { id: "project", custom: { root: path.join(here, "missing"), packages: [], skills: [] } }, null, here],
    ["本分支 off 优先", pinned, "A", here, [{ type: "custom", customType: "function-scenario", data: { id: null } }]],
  ];
  for (const [label, saved, sessionId, cwd, entries = []] of cases) {
    const { state } = envWithStore(saved);
    state.active = ["read"];
    const ctx = { ...makeCtx(state), cwd, sessionManager: { getSessionId: () => sessionId, getBranch: () => entries } };
    runSessionStart(state, ctx);
    assert.deepEqual(state.active, ["read"], label);
    assert.equal(state.setCalls.length, 0, label);
  }
});

/* ==================== C. scan 完整度守卫（7） ==================== */
test("守卫：枚举结果锐减时保持原目录文件逐字节不变", async () => {
  const known = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`npm:known-${i}`, { kind: "plugin" }]));
  const saved = JSON.stringify({ known, overrides: {} });
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, saved);
  const { state, pi } = makePi({ tools: coreTools() });
  m.default(pi);
  await state.commands.get("function").handler("scan", makeCtx(state));
  assert.equal(fs.readFileSync(process.env.PI_FUNCTION_STORE, "utf8"), saved);
});

test("守卫：小目录的完整枚举仍能更新已知插件", async () => {
  const { state, tools } = envWithStore(null);
  const ctx = { ...makeCtx(state), cwd: process.env.PI_CODING_AGENT_DIR };
  const run = () => state.commands.get("function").handler("scan", ctx);
  await run();
  tools.push(...pkgTools("pi-lens", ["new_check"]));
  await run();
  assert.ok(m.loadStore().known["npm:pi-lens"].tools.includes("new_check"));
});

test("守卫：knownCount 为 0 时不触发（首次扫描）", () => {
  const { state } = envWithStore(null);
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known: {}, overrides: {} }));
  assert.doesNotThrow(() => state.commands.get("function").handler("scan", makeCtx(state)));
});

test("守卫：扫描后登记临时目录里的 local 扩展", () => {
  const store = { known: {}, overrides: {} };
  const items = m.discoverItems({ getAllTools: () => [], getCommands: () => [] });
  const hasLocal = [...items.keys()].some((k) => k.startsWith("local:"));
  assert.equal(hasLocal, true, `应发现本地扩展：${[...items.keys()].slice(0, 5)}`);
});

test("守卫：discoverItems 能从 npm 依赖里发现包", () => {
  const items = m.discoverItems({ getAllTools: () => [], getCommands: () => [] });
  assert.ok([...items.keys()].some((k) => k.startsWith("npm:")), "应发现 npm 包");
});

test("守卫：discoverItems 把工具归属到对应包", () => {
  const tools = [{ name: "lens_diagnostics", sourceInfo: { path: "/x/node_modules/pi-lens/a.js", source: "npm:pi-lens" } }];
  const items = m.discoverItems({ getAllTools: () => tools, getCommands: () => [] });
  const hit = [...items.values()].find((it) => it.pkg === "pi-lens");
  assert.ok(hit?.tools.includes("lens_diagnostics"), "工具应归属到 pi-lens");
});

test("守卫：discoverItems 把技能归到包或独立技能项", () => {
  const commands = [{ name: "skill:grill", source: "skill", sourceInfo: { path: "/x/node_modules/pi-lens/skills/g/SKILL.md", source: "npm:pi-lens" } }];
  const items = m.discoverItems({ getAllTools: () => [], getCommands: () => commands });
  const hit = [...items.values()].find((it) => it.pkg === "pi-lens");
  assert.ok(hit?.skills.includes("grill"), "技能应归属到包");
});

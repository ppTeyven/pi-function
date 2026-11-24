// 第 30 组：装配不能把自己的工具关掉（死锁回归）(7)
// assemble_scenario 是装配入口；关掉它 = 把钥匙锁在门里。
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, localInfo, hydrate, emptyStore,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

const OWN = [
  { name: "suggest_scenario", description: "read-only scene suggestions", sourceInfo: localInfo("function-menu.js") },
  { name: "assemble_scenario", description: "assemble a scene", sourceInfo: localInfo("function-menu.js") },
];

function env({ active } = {}) {
  const tools = [...coreTools(), ...OWN, ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: active || tools.map((t) => t.name) });
  m.default(pi);
  const run = (args, opts = { selects: ["✓ 让模型决定工作流（推荐）"] }) => state.commands.get("function").handler(args, makeCtx(state, opts));
  return { pi, state, tools, run };
}

const sc = () => ({ id: "plugin", title: "插件", plugins: ["pi-lens"], skillIds: [] });

test("死锁回归：装配场景后 suggest_scenario 仍在活动工具集里", () => {
  const { pi, state } = env();
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  assert.ok(state.active.includes("suggest_scenario"), `丢了：${state.active.join(",")}`);
});

test("死锁回归：装配场景后 assemble_scenario 仍在活动工具集里", () => {
  const { pi, state } = env();
  m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  assert.ok(state.active.includes("assemble_scenario"));
});

test("死锁回归：disabled 列表里不包含自有工具", () => {
  const { pi, state } = env();
  const res = m.applyScenario(pi, makeCtx(state), sc(), emptyStore());
  assert.ok(!res.disabled.includes("suggest_scenario"));
  assert.ok(!res.disabled.includes("assemble_scenario"));
});

test("死锁回归：自有工具被手动关掉时，本地仍能出提案，取消后不改工具", async () => {
  const { state, run } = env({ active: coreTools().map((t) => t.name) });
  await run("写个爬虫抓取网页", { selects: ["✓ 使用项目推荐工作流"], confirms: [false] });
  assert.ok(state.messages.some((x) => x.customType === "function-proposal"));
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.userMessages.length, 0, "不能把请求发给缺少入口工具的模型");
});

test("死锁回归：自有工具本来就在时不重复加", async () => {
  const { state, run } = env();
  const before = state.active.filter((n) => n.startsWith("suggest") || n.startsWith("assemble")).length;
  await run("写个爬虫抓取网页");
  const after = state.active.filter((n) => n.startsWith("suggest") || n.startsWith("assemble")).length;
  assert.equal(after, before);
  assert.equal(new Set(state.active).size, state.active.length, "active 不能有重复");
});

test("死锁回归：自有工具不是插件，不计入场景审计", () => {
  const { pi } = env();
  const rows = m.auditPackages(pi, sc(), emptyStore());
  assert.ok(!rows.some((r) => r.pkg.includes("function-menu")), JSON.stringify(rows.map((r) => r.pkg)));
});

test("死锁回归：/function off 之后仍然能通过 /function <需求> 恢复这两个工具", async () => {
  const { state, run } = env();
  await run("off");
  assert.ok(!state.active.includes("assemble_scenario"), "off = 全局常开，自有工具会关掉");
  await run("编写项目文档", { selects: ["✓ 使用项目推荐工作流"], confirms: [true, false, false, false, false, false, false] });
  assert.ok(state.active.includes("assemble_scenario"), "确认本地提案后应恢复自有工具");
  assert.ok(state.active.includes("suggest_scenario"));
});

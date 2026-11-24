// 装配必须补齐本机已有的必需能力，不得把缺装误报为已启用。
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, emptyStore, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

const sc = (over = {}) => ({ id: "plugin", title: "插件", plugins: [], skillIds: [], ...over });

/* ---------------- 自动补全（5） ---------------- */
test("补全：启用契约所需的工具，回报新增能力且不再误报缺失", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.ok(state.active.includes("lens_diagnostics"), `漏用了 code-intel 工具：${state.active.join(",")}`);
  assert.deepEqual(res.autoAdded, ["pi-lens"]);
  assert.deepEqual(res.autoRoles, ["code-intel"]);
  assert.ok(!res.coverage.missing.some(miss => miss.need === "code-intel"));
  assert.match(noticeText(state), /已自动补全必需能力.*pi-lens/);
  assert.doesNotMatch(noticeText(state), /漏用检查/);
});

test("补全：角色技能由 scenarioSkillIds 自动带入，无需补全", () => {
  hydrate(m, { "code-intel": { skills: ["pi-lens-lsp"] } });
  const ids = m.comboSkillIds({ id: "plugin", skillIds: [] }, emptyStore());
  assert.ok(ids.includes("pi-lens-lsp"), "scenarioSkillIds 会自动带上角色技能");
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.deepEqual(res.autoAdded, [], "技能已在组合里，不应重复补");
});

test("补全：已经进了组合就不重复补", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: ["pi-lens"] }), emptyStore());
  assert.deepEqual(res.autoAdded, []);
  assert.ok(state.active.includes("lens_diagnostics"));
});

test("补全：not-installed 不补（本机没有就不假装有）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.deepEqual(res.autoAdded, [], "没有对应工具时不能回报已经补全");
  assert.ok(res.coverage.missing.some(miss => miss.need === "code-intel"));
});

/* ---------------- 补全优先级（3） ---------------- */
test("补全：优先补角色里排名第一的包", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens", "other-intel"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"]), ...pkgTools("other-intel", ["b"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.deepEqual(res.autoAdded, ["pi-lens"], "只补第一个，不一口气全开");
});

test("补全：第一个包没有工具时顺延到第二个", () => {
  hydrate(m, { "code-intel": { packages: ["no-tools", "pi-lens"] } });
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["a"])];
  const { pi, state } = makePi({ tools, active: coreTools().map((t) => t.name) });
  const res = m.applyScenario(pi, makeCtx(state), sc({ plugins: [] }), emptyStore());
  assert.deepEqual(res.autoAdded, ["pi-lens"]);
  assert.ok(state.active.includes("a"));
});

test("补全：roleMembers 列出角色的包与技能", () => {
  hydrate(m, { testing: { packages: ["pi-test"], skills: ["t-skill"] } });
  assert.deepEqual(m.roleMembers("testing").sort(), ["pi-test", "t-skill"]);
});

/* ---------------- 补全后不再误报（3） ---------------- */
test("补全后：仍缺的能力（not-installed）继续报警", () => {
  // 场景 docx 要求 docx 角色，profile 里没有任何成员 → 应保留告警
  hydrate(m, { "code-intel": { packages: ["pi-lens"] } });
  const { pi, state } = makePi({ tools: coreTools(), active: coreTools().map((t) => t.name) });
  m.applyScenario(pi, makeCtx(state), { id: "docx", title: "公文", plugins: [], skillIds: [] }, emptyStore());
  assert.match(noticeText(state), /漏用检查|缺「...」/);
});

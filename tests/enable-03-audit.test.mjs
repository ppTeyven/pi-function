// 启用验证 · 第 3 组：auditPackages 判定「装了 / 注册了 / 真的启用了」
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXT, isolate, makePi, coreTools, pkgTools, tool, npmInfo, skillInfo,
  hydrate, scenario, workflow, emptyStore,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

const cmd = (name, source, sourceInfo) => ({ name, description: `cmd ${name}`, source, sourceInfo });

function onePkg(name) {
  hydrate(m, { "code-intel": { packages: [name] } });
  const sc = { ...scenario(m, "plugin"), plugins: [name] };
  return sc;
}

/* ---------------------------------- ok ---------------------------------- */
test("auditPackages：工具已注册且处于 active → ok，并列出工具名", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["lens_diagnostics", "lens_check"]) });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "ok");
  assert.match(row.detail, /lens_diagnostics/);
});

test("auditPackages：包只提供命令（source=extension）→ ok，detail 报命令数", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: [], commands: [cmd("/lens-toggle", "extension", npmInfo("pi-lens"))] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "ok");
  assert.match(row.detail, /1 个命令/);
});

test("auditPackages：包只提供技能（sourceInfo 在包内）→ ok，detail 报技能数", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({
    tools: [],
    commands: [cmd("skill:lens-ast-grep", "skill", npmInfo("pi-lens", "skills/lens-ast-grep/SKILL.md"))],
  });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "ok");
  assert.match(row.detail, /1 个技能/);
});

/* -------------------------------- inactive ------------------------------- */
test("auditPackages：工具已注册但全被停用 → inactive", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["lens_diagnostics"]), active: [] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "inactive");
  assert.match(row.detail, /工具已注册但已停用/);
});

test("auditPackages：工具全停用但还有命令可用 → warn（降级而非全坏）", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({
    tools: pkgTools("pi-lens", ["lens_diagnostics"]),
    commands: [cmd("/lens-toggle", "extension", npmInfo("pi-lens"))],
    active: [],
  });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "warn", "有命令兜底时应报 warn，不要报 inactive");
  assert.match(row.detail, /仍可用 1 个命令/);
});

test("auditPackages：工具全停用但有技能可用 → warn", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({
    tools: pkgTools("pi-lens", ["lens_diagnostics"]),
    commands: [cmd("skill:lens-ast-grep", "skill", npmInfo("pi-lens", "skills/lens-ast-grep/SKILL.md"))],
    active: [],
  });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "warn");
  assert.match(row.detail, /1 个技能/);
});

test("auditPackages：工具全停用且没有任何命令/技能 → 仍是 inactive", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["lens_diagnostics"]), active: [] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "inactive", "没有任何替代可用时必须报 inactive，不能被 warn 掩盖");
});

test("auditPackages：同名包的工具部分启用也算 ok（有任一 active）", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["lens_diagnostics", "lens_check"]), active: ["lens_check"] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "ok");
});

/* --------------------------------- absent -------------------------------- */
test("auditPackages：什么都没注册 → absent", () => {
  const sc = onePkg("pi-not-installed");
  const { pi } = makePi({ tools: [] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "absent");
  assert.match(row.detail, /未安装或未注册/);
});

test("auditPackages：只有 skills 目录下的独立技能、没有包内产物 → 现状判 absent（记录限制）", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: [], commands: [cmd("skill:lens-lsp", "skill", skillInfo("lens-lsp"))] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "absent", "skill 的 sourceInfo 不在 node_modules 时无法归属到包（已知限制）");
});

/* -------------------------------- 归属正确性 ------------------------------ */
test("auditPackages：不会把别的包的工具算到本包头上", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: [...pkgTools("pi-test", ["test_run"]), ...pkgTools("pi-lens", ["lens_diagnostics"])] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.ok(!row.detail.includes("test_run"), `串台了：${row.detail}`);
});

test("auditPackages：相似包名不串台（pi-lens vs pi-lens-extra）", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: pkgTools("pi-lens-extra", ["extra_tool"]) });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.equal(row.state, "absent");
});

/* -------------------------------- 集合完整性 ------------------------------ */
test("auditPackages：每个场景插件都有一行审计（不多不少）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const sc = { ...scenario(m, "plugin"), plugins: ["pi-lens", "pi-test"] };
  const { pi } = makePi({ tools: [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])] });
  const rows = m.auditPackages(pi, sc, emptyStore());
  assert.deepEqual(rows.map((r) => r.pkg).sort(), ["pi-lens", "pi-test"]);
});

test("auditPackages：工作流追加的插件也进入审计（不漏检）", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const sc = { ...scenario(m, "plugin"), plugins: ["pi-lens"] };
  const { pi } = makePi({ tools: pkgTools("pi-lens", ["lens_diagnostics"]) });
  const rows = m.auditPackages(pi, sc, {}, { id: "w", plugins: ["pi-test"], skills: [] });
  assert.ok(rows.some((r) => r.pkg === "pi-test"), "工作流带的包必须被审计");
  assert.equal(rows.find((r) => r.pkg === "pi-test").state, "absent");
});

test("auditPackages：场景没有任何插件时返回空数组（不是 undefiend）", () => {
  const sc = { id: "empty", plugins: [] };
  const { pi } = makePi({ tools: coreTools() });
  assert.deepEqual(m.auditPackages(pi, sc, emptyStore()), []);
});

test("auditPackages：核心工具不会被算进任何插件", () => {
  const sc = onePkg("pi-lens");
  const { pi } = makePi({ tools: [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])] });
  const [row] = m.auditPackages(pi, sc, emptyStore());
  assert.ok(!/\bread\b|\bbash\b/.test(row.detail), "核心工具不该出现在插件明细里");
});

/* ----------------------------- commandsForPkg ---------------------------- */
test("commandsForPkg：只返回 extension 来源、且属于该包的命令", () => {
  const { pi } = makePi({
    tools: [],
    commands: [
      cmd("/lens-toggle", "extension", npmInfo("pi-lens")),
      cmd("skill:lens-ast-grep", "skill", npmInfo("pi-lens")),
      cmd("/other", "extension", npmInfo("other")),
    ],
  });
  const got = m.commandsForPkg(pi, "pi-lens").map((c) => c.name);
  assert.deepEqual(got, ["/lens-toggle"]);
});

test("commandsForPkg：包不存在时返回空数组", () => {
  const { pi } = makePi({ tools: [], commands: [] });
  assert.deepEqual(m.commandsForPkg(pi, "nope"), []);
});

/* ------------------------------ 组合场景断言 ----------------------------- */
test("auditPackages：组合装配里任一包 inactive 都算发现问题", () => {
  hydrate(m, { "code-intel": { packages: ["pi-lens"] }, testing: { packages: ["pi-test"] } });
  const sc = { ...scenario(m, "plugin"), id: "plugin+api", comboIds: ["plugin", "api"], plugins: ["pi-lens", "pi-test"] };
  const { pi } = makePi({
    tools: [...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("pi-test", ["test_run"])],
    active: ["lens_diagnostics"],
  });
  const bad = m.auditPackages(pi, sc, emptyStore()).filter((r) => r.state !== "ok");
  assert.deepEqual(bad.map((r) => `${r.pkg}:${r.state}`), ["pi-test:inactive"]);
});

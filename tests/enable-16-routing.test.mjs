// /function 的菜单、目录/状态查询、归类和直达子命令。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, noticeText,
} from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

function env() {
  const tools = [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  return { state, pi, tools, run: (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts)) };
}
const readStore = () => JSON.parse(fs.readFileSync(process.env.PI_FUNCTION_STORE, "utf8"));

/* ---------------- 无参 / 子功能菜单（3） ---------------- */
test("路由：/function 无参且无 UI 时直接退出，不改工具集", async () => {
  const { state, run } = env();
  await run("", { hasUI: false });
  assert.equal(state.setCalls.length, 0);
});

test("路由：无参打开子功能菜单，取消后不装配", async () => {
  const { state, run } = env();
  await run("", { selects: [null] });
  assert.match(state.selectCalls[0].title, /子功能/);
  assert.equal(state.setCalls.length, 0);
  assert.match(noticeText(state), /已取消/);
});

test("目录命令：扫描登记实际插件，画像报告显示已发现的角色；不切换工具", async () => {
  const { state, run } = env();
  await run("SCAN");
  assert.match(noticeText(state), /扫描完成/);
  assert.ok(readStore().known["npm:pi-lens"].tools.includes("lens_diagnostics"));
  await run("profile");
  const msg = state.messages.find(x => x.customType === "function-profile");
  assert.match(msg?.content || "", /能力画像/);
  assert.match(msg?.content || "", /pi-lens/);
  await run("status");
  await run("stats");
  assert.equal(state.setCalls.length, 0);
});

/* ---------------- assign（4） ---------------- */
test("路由：/function assign 缺参数给用法提示", async () => {
  const { state, run } = env();
  await run("assign");
  assert.match(noticeText(state), /用法/);
});

test("路由：/function assign 未知场景被拒绝", async () => {
  const { state, run } = env();
  await run("assign npm:pi-lens not-a-scene");
  assert.match(noticeText(state), /未知场景 id/);
});

test("路由：/function assign 成功写入 overrides", async () => {
  const { run } = env();
  await run("assign npm:pi-lens plugin");
  assert.equal(readStore().overrides["npm:pi-lens"], "plugin");
});

test("路由：/function assign none 表示取消归类", async () => {
  const { run } = env();
  await run("assign npm:pi-lens none");
  assert.equal(readStore().overrides["npm:pi-lens"], "none");
});

/* ---------------- 场景直达 / 组合 ---------------- */
test("路由：/function <工作流id> 走工作流装配", async () => {
  const { state, run } = env();
  await run("research", { confirms: [true] });
  assert.equal(state.entries.at(-1).d.id, "workflow");
  assert.equal(state.entries.at(-1).d.workflow, "research");
});

test("路由：/function <a>+<b> 组合装配", async () => {
  const { state, run } = env();
  await run("plugin+api", { confirms: [true] });
  assert.equal(state.entries.at(-1).d.id, "plugin+api");
});

test("路由：别名 /pi-function 能调用相同的状态功能", async () => {
  const { state } = env();
  await state.commands.get("pi-function").handler("status", makeCtx(state));
  assert.match(noticeText(state), /当前组合：未装配/);
});

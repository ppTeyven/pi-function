// 第 16 组：/function 所有子命令的路由（25）
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

test("路由：/function 无参有 UI 时弹子功能菜单", async () => {
  const { state, run } = env();
  await run("", { selects: [undefined] });
  assert.ok(state.selectCalls.length >= 1);
  assert.match(state.selectCalls[0].title, /子功能/);
});

test("路由：子功能菜单取消后不装配", async () => {
  const { state, run } = env();
  await run("", { selects: [null] });
  assert.equal(state.setCalls.length, 0);
  assert.match(noticeText(state), /已取消/);
});

/* ---------------- scan / profile / status / stats（8） ---------------- */
test("路由：/function scan 提示扫描完成", async () => {
  const { state, run } = env();
  await run("scan");
  assert.match(noticeText(state), /扫描完成/);
});

test("路由：/function scan 会写入 store 文件", async () => {
  const { run } = env();
  await run("scan");
  assert.ok(fs.existsSync(process.env.PI_FUNCTION_STORE));
});

test("路由：/function profile 发画像消息", async () => {
  const { state, run } = env();
  await run("profile");
  assert.ok(state.messages.some((x) => x.customType === "function-profile"));
});

test("路由：/function profile 的内容含能力角色", async () => {
  const { state, run } = env();
  await run("profile");
  const msg = state.messages.find((x) => x.customType === "function-profile");
  assert.match(String(msg.content), /能力画像/);
});

test("路由：/function status 报当前组合", async () => {
  const { state, run } = env();
  await run("status");
  assert.match(noticeText(state), /当前组合/);
});

test("路由：/function status 报扩展版本", async () => {
  const { state, run } = env();
  await run("status");
  assert.match(noticeText(state), new RegExp(`v${m.EXT_VERSION.replace(/\./g, "\\.")}`));
});

test("路由：/function stats 发统计消息", async () => {
  const { state, run } = env();
  await run("stats");
  assert.ok(state.messages.some((x) => x.customType === "function-stats"));
});

test("路由：/function stats reset 清空计数", async () => {
  const { run } = env();
  await run("plugin", { confirms: [true] });
  assert.ok(readStore().usage, "先有计数");
  await run("stats reset");
  const s = readStore();
  assert.deepEqual(s.usage, {});
  assert.deepEqual(s.itemUse, {});
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

/* ---------------- off（2） ---------------- */
test("路由：/function off 重置为全局常开", async () => {
  const { state, run } = env();
  await run("plugin", { confirms: [true] });
  await run("off");
  assert.ok(!state.active.includes("lens_diagnostics"));
});

test("路由：/function off 后 store.active 为 null", async () => {
  const { run } = env();
  await run("plugin", { confirms: [true] });
  await run("off");
  assert.equal(readStore().active, null);
});

/* ---------------- 场景直达 / 组合（4） ---------------- */
test("路由：/function scenario <id> 走固定场景（强制）", async () => {
  const { state, run } = env();
  await run("scenario plugin", { confirms: [true] });
  assert.equal(state.entries.at(-1).d.id, "plugin");
});

test("路由：/function scenario <bad> 被拒绝", async () => {
  const { state, run } = env();
  await run("scenario nope");
  assert.match(noticeText(state), /未知场景 id/);
  assert.equal(state.setCalls.length, 0);
});

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

/* ---------------- resume / 需求文本（3） ---------------- */
test("路由：/function resume 发项目报告", async () => {
  const { state, run } = env();
  await run("resume", { hasUI: false });
  assert.ok(state.messages.some((x) => x.customType === "function-project"));
});

test("路由：需求文本交给模型（不发本地提案）", async () => {
  const { state, run } = env();
  await run("写个爬虫抓取网页");
  assert.equal(state.userMessages.length, 1);
  assert.equal(state.messages.filter((x) => x.customType === "function-need").length, 0);
});

test("路由：只读子命令不改工具集", async () => {
  const { state, run } = env();
  for (const cmd of ["status", "stats", "profile", "scan"]) await run(cmd);
  assert.equal(state.setCalls.length, 0);
});

/* ---------------- 别名与大小写（2） ---------------- */
test("路由：/pi-function 与 /function 是同一个 handler", () => {
  const { state } = env();
  assert.equal(state.commands.get("pi-function"), state.commands.get("function"));
});

test("路由：子命令大小写不敏感（SCAN）", async () => {
  const { state, run } = env();
  await run("SCAN");
  assert.match(noticeText(state), /扫描完成/);
});

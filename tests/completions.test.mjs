// /function 的参数补全：列表第一项必须是 /function 本身，Tab/Enter 直接用。
import assert from "node:assert/strict";
import test from "node:test";
import { EXT } from "./_bootstrap.mjs";

const m = await import(EXT);

const capture = () => {
  const state = { cmd: null };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") state.cmd = cmd; },
    on() {},
    appendEntry() {},
    sendMessage() {},
    getAllTools: () => [],
    getActiveTools: () => [],
    setActiveTools() {},
    getCommands: () => [],
    getAllSkills: () => [],
  };
  m.default(pi);
  return state.cmd;
};

test("K1 裸 /function 不弹候选（回车直接进菜单，不给缓存留把柄）", () => {
  const cmd = capture();
  assert.equal(cmd.getArgumentCompletions(""), null);
  assert.equal(cmd.getArgumentCompletions("   "), null);
  const items = cmd.getArgumentCompletions("m");
  assert.deepEqual(items.map((i) => i.value), ["menu"]);
});

test("K2 前缀过滤：第一项换成对应子命令，其它不相关项消失", () => {
  const cmd = capture();
  assert.deepEqual(cmd.getArgumentCompletions("s").map((i) => i.value), ["scan", "status", "stats"]);
  assert.deepEqual(cmd.getArgumentCompletions("m").map((i) => i.value), ["menu"]);
  assert.deepEqual(cmd.getArgumentCompletions("a").map((i) => i.value), ["assemble", "assign"]);
});

test("K3 子命令不重复，且都能按前缀过滤", () => {
  const cmd = capture();
  const all = cmd.getArgumentCompletions("a").concat(cmd.getArgumentCompletions("m"), cmd.getArgumentCompletions("w"), cmd.getArgumentCompletions("p"), cmd.getArgumentCompletions("s"), cmd.getArgumentCompletions("o")).map((i) => i.value).filter((v, i, arr) => arr.indexOf(v) === i);
  assert.equal(new Set(all).size, all.length, "有重复项");
  assert.ok(all.includes("menu") && all.includes("assemble") && all.includes("assign") && all.includes("off"));
  assert.equal(cmd.getArgumentCompletions("zzz"), null);
});

test("K4 menu 参数等同于不填参数（走子命令菜单，不当成需求文本）", async () => {
  const state = { run: null, messages: [], notices: [] };
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") state.run = cmd.handler || cmd; },
    on() {},
    appendEntry() {},
    sendMessage: (msg) => state.messages.push(msg),
    getAllTools: () => [], getActiveTools: () => [], setActiveTools() {},
    getCommands: () => [], getAllSkills: () => [],
  };
  m.default(pi);
  const ctx = { hasUI: false, ui: { notify: (t) => state.notices.push(t) } };
  await state.run("menu", ctx);
  assert.equal(state.messages.length, 0, "menu 不该被当成需求文本生成装配说明");
  await state.run("帮我做个海报", ctx);
  assert.ok(state.messages.length > 0, "普通文本应该照旧走动态分析");
});

test("K5 扩展版本号与 package.json 一致（用来确认 /reload 加载的是哪一版）", async () => {
  const fs = await import("node:fs");
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(m.EXT_VERSION, pkg.version);
});

test("K6 /fn 是“不带参数补全”的快捷入口，回车不会被 assemble 抢走", () => {
  const reg = {};
  const pi = {
    registerTool() {},
    registerCommand(name, cmd) { reg[name] = cmd; },
    on() {}, appendEntry() {}, sendMessage() {},
    getAllTools: () => [], getActiveTools: () => [], setActiveTools() {},
    getCommands: () => [], getAllSkills: () => [],
  };
  m.default(pi);
  assert.ok(reg.fn, "没有注册 /fn");
  assert.equal(reg.fn.getArgumentCompletions, undefined, "/fn 不该有参数补全");
  assert.equal(reg.fn.handler, reg.function.handler, "/fn 应与 /function 同一实现");
});

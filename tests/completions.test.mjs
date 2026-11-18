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

test("K1 不输前缀时，第一项就是“直接使用”（等价于不填参数）", () => {
  const cmd = capture();
  const items = cmd.getArgumentCompletions("");
  assert.equal(items[0].value, "menu", `第一项实际是 ${items[0].value}`);
  assert.match(items[0].description, /场景菜单/);
});

test("K2 前缀过滤：第一项换成对应子命令，其它不相关项消失", () => {
  const cmd = capture();
  assert.deepEqual(cmd.getArgumentCompletions("s").map((i) => i.value), ["scan", "status", "stats"]);
  assert.deepEqual(cmd.getArgumentCompletions("m").map((i) => i.value), ["menu"]);
  assert.deepEqual(cmd.getArgumentCompletions("a").map((i) => i.value), ["assemble", "assign"]);
});

test("K3 子命令不重复，且都能按前缀过滤", () => {
  const cmd = capture();
  const all = cmd.getArgumentCompletions("").map((i) => i.value);
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

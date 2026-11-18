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

test("K1 不输前缀时，第一项是空的 value（就是 /function 本身）", () => {
  const cmd = capture();
  const items = cmd.getArgumentCompletions("");
  assert.equal(items[0].value, "", `第一项实际是 ${items[0].value}`);
  assert.match(items[0].description, /不填参数/);
});

test("K2 空项只在不输前缀时出现（输了前缀就过滤掉）", () => {
  const cmd = capture();
  const items = cmd.getArgumentCompletions("s");
  assert.ok(!items.some((i) => i.value === ""), "有前缀时不该出现空项");
  assert.deepEqual(items.map((i) => i.value), ["scan", "status", "stats"]);
});

test("K3 子命令不重复，且都能按前缀过滤", () => {
  const cmd = capture();
  const all = cmd.getArgumentCompletions("").map((i) => i.value);
  assert.equal(new Set(all).size, all.length, "有重复项");
  assert.ok(all.includes("assemble") && all.includes("assign") && all.includes("off"));
  assert.deepEqual(cmd.getArgumentCompletions("a").map((i) => i.value), ["assemble", "assign"]);
  assert.equal(cmd.getArgumentCompletions("zzz"), null);
});

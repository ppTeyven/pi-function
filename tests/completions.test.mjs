// /function 不再提供参数候选：这是刻意的决定，别再加回来。
// 前端会把候选表按命令名缓存一次，/reload 不刷新 → 旧表抢走回车（2.21.x 的坑）。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT } from "./_bootstrap.mjs";
const m = await import(EXT);

const capture = () => {
  const reg = {};
  m.default({
    registerTool() {},
    registerCommand(name, cmd) { reg[name] = cmd; },
    on() {}, appendEntry() {}, sendMessage() {},
    getAllTools: () => [], getActiveTools: () => [], setActiveTools() {},
    getCommands: () => [], getAllSkills: () => [],
  });
  return reg;
};

test("K1 /function 不提供参数候选（不发布列表，就没有可过期的缓存）", () => {
  const reg = capture();
  assert.equal(reg.function.getArgumentCompletions, undefined);
});

test("K2 没有 /fn 这类只为绕过补全面板而生的别名", () => {
  const reg = capture();
  assert.deepEqual(Object.keys(reg).sort(), ["function", "pi-function"]);
});

test("K3 没有候选可看之后，子功能仍写在描述里；/pi-function 与 /function 同一实现", () => {
  const reg = capture();
  for (const word of ["装配", "工作流", "画像", "扫描", "状态", "统计", "还原", "归类"]) {
    assert.ok(reg.function.description.includes(word), `描述里缺「${word}」`);
  }
  assert.equal(reg["pi-function"].handler, reg.function.handler);
});

test("K4 无参数时走子命令菜单，而不是把空串当需求文本", async () => {
  const state = { selects: [], run: null, notices: [] };
  m.default({
    registerTool() {},
    registerCommand(name, cmd) { if (name === "function") state.run = cmd.handler || cmd; },
    on() {}, appendEntry() {}, sendMessage() {},
    getAllTools: () => [], getActiveTools: () => [], setActiveTools() {},
    getCommands: () => [], getAllSkills: () => [],
  });
  const ctx = {
    hasUI: true,
    ui: {
      notify: (t) => state.notices.push(String(t)),
      select: async (title, options) => { state.selects.push({ title, options }); return null; },
      confirm: async () => false,
      input: async () => null,
      setEditorText: () => {},
    },
  };
  await state.run("", ctx);
  assert.equal(state.selects.length, 1, "空参数应弹出子命令菜单");
  assert.match(state.selects[0].title, /子功能/);
  assert.ok(state.selects[0].options.some((o) => o.startsWith("assemble ·")));
});

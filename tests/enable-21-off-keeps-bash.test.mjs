// 第 21 组：/function off 不能弄丢 bash（回归）(6)
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, noticeText } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

/* 模拟 pi-web 下的真实形态：bash 由扩展/SDK 注册，sourceInfo 不是 builtin: */
function env({ bashSource = "npm:@agegr/pi-web", settings = {} } = {}) {
  const tools = [
    ...coreTools(),
    { name: "bash", description: "run shell", sourceInfo: { path: "/x/dist/shell.js", source: bashSource } },
    { name: "powershell", description: "run pwsh", sourceInfo: { path: "/x/dist/pwsh.js", source: bashSource } },
    ...pkgTools("pi-lens", ["lens_diagnostics"]),
  ];
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name), settings });
  m.default(pi);
  return { pi, state, tools, run: (a, o) => state.commands.get("function").handler(a, makeCtx(state, o || {})) };
}

test("off：bash 不是 builtin: 注册时也必须保留（回归：曾在 pi-web 下丢 bash）", async () => {
  const { state, run } = env();
  await run("off");
  assert.ok(state.active.includes("bash"), `off 后丢了 bash：${state.active.join(",")}`);
});

test("off：只保留常开工具，插件工具仍被关掉", async () => {
  const { state, run } = env();
  await run("off");
  assert.ok(!state.active.includes("lens_diagnostics"));
});

test("off：read/edit/write 这类默认工具始终在", async () => {
  const { state, run } = env();
  await run("off");
  for (const n of ["read", "edit", "write"]) assert.ok(state.active.includes(n), `丢了 ${n}`);
});

test("off：settings 用 -bash 显式排除时尊重配置", async () => {
  const { state, run } = env({ settings: { defaultTools: ["-bash"] } });
  await run("off");
  assert.ok(!state.active.includes("bash"), "用户显式排除时不应强行加回");
});

test("off：getAllTools 里没有的工具不会被凭空加进来", async () => {
  const tools = coreTools().filter((t) => t.name !== "bash"); // 模拟 pi 真没注册 bash
  const { pi, state } = makePi({ tools, active: tools.map((t) => t.name) });
  m.default(pi);
  await state.commands.get("function").handler("off", makeCtx(state));
  assert.ok(!state.active.includes("bash"));
});

test("off：通知里列出了最终保留的工具", async () => {
  const { state, run } = env();
  await run("off");
  assert.match(noticeText(state), /已还原为全局常开工具/);
  assert.match(noticeText(state), /bash/);
});

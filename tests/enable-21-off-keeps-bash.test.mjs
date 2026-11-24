// /function off 在 pi-web 宿主中不能弄丢非 builtin 注册的 bash。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, hydrate, noticeText } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);
hydrate(m, { "code-intel": { packages: ["pi-lens"] } });

/* 模拟 pi-web 下的真实形态：bash 由扩展/SDK 注册，sourceInfo 不是 builtin: */
function env({ bashSource = "npm:@agegr/pi-web", settings = {} } = {}) {
  const tools = [
    ...coreTools().filter(t => t.name !== "bash"),
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
  assert.deepEqual(state.active.toSorted(), coreTools().map(t => t.name).toSorted());
  assert.match(noticeText(state), /已还原为全局常开工具.*bash/);
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

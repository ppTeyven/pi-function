// 持久化反馈：只由显式命令清零；统计是可观察的状态，不是提示文字。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

test("stats：先报告真实非零计数，只在显式 reset 时清掉所有统计桶", async () => {
  const stats = {
    usage: { plugin: { "pi-lens": 2 } },
    itemUse: { plugin: { "pi-lens": 3 } },
    wfUsage: { debug: 2 },
    manualAdds: { plugin: { "pi-lens": 1 } },
  };
  // 模拟宿主只枚举到目录的一小部分：扫描守卫不先写盘，隔离统计命令本身的效果。
  const known = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`npm:catalog-${i}`, { kind: "plugin" }]));
  fs.writeFileSync(process.env.PI_FUNCTION_STORE, JSON.stringify({ version: 1, known, ...stats }));
  const { pi, state } = makePi({ tools: [...coreTools(), ...pkgTools("pi-lens", ["lens_diagnostics"])] });
  m.default(pi);
  const run = (args, opts) => state.commands.get("function").handler(args, makeCtx(state, opts));
  await run("stats");
  assert.match(state.messages.find(x => x.customType === "function-stats")?.content || "", /pi-lens.*[23]/);
  await run("stats about clear cache", { hasUI: false });
  for (const [key, value] of Object.entries(stats)) assert.deepEqual(m.loadStore()[key], value, key);
  await run("stats reset");
  const saved = m.loadStore();
  for (const key of Object.keys(stats)) assert.deepEqual(saved[key], {}, key);
  assert.ok(saved.resetAt);
});

test("共享统计：两会话增量都落盘，旧会话不能把清零前的计数加回", () => {
  const file = process.env.PI_FUNCTION_STORE;
  fs.writeFileSync(file, JSON.stringify({ version: 1, usage: { plugin: { "pi-lens": 3 } } }));
  const a = m.loadStore();
  const b = m.loadStore();
  a.usage.plugin["pi-lens"] += 1;
  b.usage.plugin["pi-lens"] += 2;
  assert.equal(m.saveStore(a), true);
  assert.equal(m.saveStore(b), true);
  assert.deepEqual(m.loadStore().usage, { plugin: { "pi-lens": 6 } });

  const stale = m.loadStore();
  const reset = m.loadStore();
  reset.usage = {};
  reset.resetAt = new Date().toISOString();
  assert.equal(m.saveStore(reset), true);
  stale.usage.plugin["pi-lens"] += 1;
  assert.equal(m.saveStore(stale), true);
  assert.deepEqual(m.loadStore().usage, {}, "清零前启动的会话不能复活旧统计");
});

// 场景 id 迁移：旧版分类写进 store 的死 id 必须被拉回现行场景，不能永远漂着。
import assert from "node:assert/strict";
import test from "node:test";

import { EXT } from "./_bootstrap.mjs";
const m = await import(EXT);

const item = (id, text) => ({ id, kind: id.startsWith("skill:") ? "skill" : "plugin", pkg: null, label: id, description: text, text, tools: [], commands: [], skills: [] });
const seed = (id, scenario, extra = {}) => ({ [id]: { kind: "skill", label: id, scenario, auto: true, firstSeen: "2026-01-01T00:00:00.000Z", ...extra } });
const storeWith = (known) => ({ version: 1, known, overrides: {}, usage: {}, itemUse: {}, manualAdds: {}, classifierVersion: 0 });
const valid = new Set(m.SCENARIOS.map((s) => s.id));

test("M1 死 id 且分类器命中 → 用新分类", () => {
  const store = storeWith(seed("skill:x", "webui"));
  m.reconcile(store, new Map([["skill:x", item("skill:x", "PPT 演示文稿 幻灯片 排版")]]));
  assert.ok(valid.has(store.known["skill:x"].scenario), `仍是非法场景：${store.known["skill:x"].scenario}`);
});

test("M2 死 id 且分类器不命中 → 走迁移表", () => {
  const store = storeWith(seed("skill:y", "release"));
  m.reconcile(store, new Map([["skill:y", item("skill:y", "zzz qqq")]]));
  assert.equal(store.known["skill:y"].scenario, "maintain");
});

test("M3 未知 id 且迁移表没有 → 归为未分类，而不是留个死字符串", () => {
  const store = storeWith(seed("skill:z", "ancient-thing"));
  const res = m.reconcile(store, new Map([["skill:z", item("skill:z", "zzz qqq")]]));
  assert.equal(store.known["skill:z"].scenario, null);
  assert.ok(res.changed.some((c) => c.id === "skill:z" && c.to === null));
});

test("M4 合法场景不受影响", () => {
  const store = storeWith(seed("skill:w", "article"));
  m.reconcile(store, new Map([["skill:w", item("skill:w", "zzz qqq")]]));
  assert.equal(store.known["skill:w"].scenario, "article");
});

test("M5 手动归类不会被迁移覆盖", () => {
  const store = storeWith(seed("skill:v", "release", { auto: false }));
  m.reconcile(store, new Map([["skill:v", item("skill:v", "PPT 演示文稿")]]));
  assert.equal(store.known["skill:v"].scenario, "release");
});

test("M6 迁移后全表只剩现行场景（外加 infra / 未分类）", () => {
  const known = Object.assign({}, seed("skill:a", "webui"), seed("skill:b", "gsd"), seed("skill:c", "parallel"), seed("npm:p", "infra", { kind: "plugin" }));
  const store = storeWith(known);
  const items = new Map([["skill:a", item("skill:a", "zzz")], ["skill:b", item("skill:b", "zzz")], ["skill:c", item("skill:c", "zzz")], ["npm:p", item("npm:p", "zzz")]]);
  m.reconcile(store, items);
  for (const [id, meta] of Object.entries(store.known)) {
    assert.ok(meta.scenario === null || meta.scenario === "infra" || valid.has(meta.scenario), `${id} 仍指向废弃场景 ${meta.scenario}`);
  }
});

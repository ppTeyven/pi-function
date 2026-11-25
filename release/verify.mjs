// Contributor release check: deliberately not part of the published npm bundle.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { CAPABILITIES, SCENARIOS } from "../function-menu.js";

const minPrecision = 0.8;
const caseCount = 33;
const asset = (name) => new URL(name, import.meta.url);

function verify() {
  const bytes = readFileSync(asset("g3-g4-v1.json"));
  const sha = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha, readFileSync(asset("g3-g4-v1.sha256"), "utf8").trim(), "验收集校验失败；不能更改冻结样例、答案或能力目录后沿用旧成绩");
  const { version, readiness, cases, catalog } = JSON.parse(bytes);
  assert.equal(version, 1);
  assert.equal(readiness, "frozen");
  assert.deepEqual(cases.map(({ id }) => id), Array.from({ length: caseCount }, (_, i) => `A${String(i + 1).padStart(2, "0")}`));

  const { values } = parseArgs({ options: { results: { type: "string" }, json: { type: "boolean" } } });
  assert.ok(values.results, "缺少真实 LLM 记录：先执行 npm run capture:release -- --out <results.json>，然后传 --results <results.json>。");
  const capture = JSON.parse(readFileSync(values.results, "utf8"));
  assert.equal(capture.version, 1);
  assert.equal(capture.origin, "pi-sdk-real-llm", "正式门禁不接受诊断试跑、本地分类器或模拟结果");
  assert.ok(capture.model?.provider && capture.model?.id, "缺少模型来源");
  assert.equal(capture.datasetSha, sha, "记录不是来自当前冻结集");
  assert.equal(capture.implementationSha, createHash("sha256").update(readFileSync(asset("../function-menu.js"))).digest("hex"), "实现已变化，必须重新留存真实模型结果");
  assert.deepEqual(capture.cases.map(row => row.id), cases.map(row => row.id), "正式门禁必须跑完 33 条，不能用部分样例替代");
  const profileSpec = {};
  const installed = new Set();
  for (const { role, package: pkg, skill, description } of catalog) {
    assert.ok(Object.hasOwn(CAPABILITIES, role) && !Object.hasOwn(profileSpec, role), `非法或重复能力角色：${role}`);
    assert.ok(typeof description === "string" && description.trim(), `能力描述缺失：${role}`);
    profileSpec[role] = { packages: [pkg], skills: [skill] };
    for (const [prefix, id] of [["npm", pkg], ["skill", skill]]) {
      const key = `${prefix}:${id}`;
      assert.ok(typeof id === "string" && id.trim() && !installed.has(key), `非法或重复目录条目：${key}`);
      installed.add(key);
    }
  }

  const sceneIds = new Set(SCENARIOS.map((scene) => scene.id));
  const members = (role) => [
    ...(profileSpec[role]?.packages || []).map((id) => `npm:${id}`),
    ...(profileSpec[role]?.skills || []).map((id) => `skill:${id}`),
  ];
  const rows = cases.map(({ id, text, accept, required, optional, forbidden }, index) => {
    assert.ok(typeof text === "string" && text.trim(), `${id} 缺少输入`);
    assert.ok(accept.length && accept.every((value) => sceneIds.has(value)), `${id} 缺少合法场景标签`);
    const roles = [...required, ...optional, ...forbidden];
    assert.ok(roles.every((role) => Object.hasOwn(CAPABILITIES, role)), `${id} 存在非法能力标签`);
    assert.equal(new Set(roles).size, roles.length, `${id} 的能力标签重叠或重复`);
    const { plan } = capture.cases[index];
    assert.ok(plan === null || (typeof plan.scenario === "string" && Array.isArray(plan.plugins) && Array.isArray(plan.skills)), `${id} 结果必须是经验证的提案或明确为空`);
    const top = plan?.scenario.split("+")[0] ?? null;
    const picked = new Set(plan ? [...plan.plugins, ...plan.skills.map(skill => `skill:${skill}`)] : []);
    assert.ok([...picked].every(key => installed.has(key)), `${id} 提案中有冻结目录以外的条目`);
    const relevant = new Set([...required, ...optional].flatMap(members));
    const disallowed = new Set(forbidden.flatMap(members));
    const extra = [...picked].filter((key) => !relevant.has(key));
    const precision = picked.size ? (picked.size - extra.length) / picked.size : 0;
    return {
      id, accept, top, intentHit: accept.includes(top), precision, extra,
      zero: !picked.size,
      missing: required.filter((role) => members(role).length && !members(role).some((key) => picked.has(key))),
      unavailable: required.filter((role) => !members(role).length),
      forbidden: [...picked].filter((key) => disallowed.has(key)),
    };
  });
  const precision = rows.reduce((sum, row) => sum + row.precision, 0) / caseCount;
  const hits = rows.filter((row) => row.intentHit).length;
  const counts = {
    zero: rows.filter((row) => row.zero).length,
    missing: rows.filter((row) => row.missing.length).length,
    unavailable: rows.filter((row) => row.unavailable.length).length,
    forbidden: rows.filter((row) => row.forbidden.length).length,
  };
  const g3 = precision >= minPrecision && !counts.zero && !counts.missing && !counts.forbidden;
  const g4 = hits === caseCount;
  if (values.json) console.log(JSON.stringify({ sha, model: capture.model, g3, g4, precision, hits, caseCount, counts, rows }, null, 2));
  else {
    console.log(`模型：${capture.model.provider}/${capture.model.id}`);
    console.log(`G3 ${g3 ? "PASS" : "FAIL"}: ${(precision * 100).toFixed(2)}% (≥ 80%); 零推荐 ${counts.zero}，已装必需项漏选 ${counts.missing}，目录缺装 ${counts.unavailable}，禁止项误选 ${counts.forbidden}`);
    console.log(`G4 ${g4 ? "PASS" : "FAIL"}: ${hits}/${caseCount}`);
    for (const row of rows) {
      const clues = [
        !row.intentHit && `场景 ${row.top ?? "无"}（期望 ${row.accept.join("/")}）`,
        row.zero && "零推荐",
        row.missing.length && `漏选 ${row.missing.join(", ")}`,
        row.unavailable.length && `目录缺装 ${row.unavailable.join(", ")}`,
        row.forbidden.length && `禁止 ${row.forbidden.join(", ")}`,
        row.extra.length && `不相关 ${row.extra.join(", ")}`,
      ].filter(Boolean);
      if (clues.length) console.log(`${row.id}: ${clues.join("；")}`);
    }
    console.log(`验收集 SHA-256: ${sha}`);
  }
  return g3 && g4;
}

try {
  if (!verify()) process.exitCode = 1;
} catch (error) {
  console.error(`未完成发布验收：${error.message}`);
  process.exitCode = 2;
}

import assert from "node:assert/strict";
import test from "node:test";
import { analyzeNeed, hydrateCatalog, scoreScenarios, selectByCoverage } from "../function-menu.js";
import { emptyStore, makeProfile } from "./lib/mock-pi.mjs";

// Development regressions, independent of the frozen release cases.
test("场景匹配不把英文子串、模板背景或明确排除项当成产物", () => {
  const cases = [
    ["Mapping the capitalized values", null, ["api", "mobile", "plugin"]],
    ["Fix the keyboard navigation regression in the existing gallery extension", "maintain"],
    ["给现有图书室加一个浏览器端预约系统，读者可以登录并取消自己的预约", "webapp"],
    ["写一份新员工交接手册；不需要 PPT 或短视频", "docs", ["presentation", "video"]],
    ["Create three posters for the library window; no slide deck", "image", ["presentation"]],
  ];
  for (const [text, expected, excluded = []] of cases) {
    const ranked = scoreScenarios(text).map(({ scenario }) => scenario.id);
    if (expected) assert.equal(ranked[0], expected, text);
    for (const id of excluded) assert.ok(!ranked.includes(id), `${text}: ${id}`);
  }
});

test("场景识别优先看要交付的东西，不把背景中的旧产物当成任务", () => {
  const examples = [
    ["原先有一份研究报告和调研数据。请帮我写一份操作手册。", "docs"],
    ["We already have a blog post and newsletter. Please make a slide deck for the meeting.", "presentation"],
    ["已经有新闻稿和公众号文章。想要一封客户邮件；不做：短视频。", "email"],
  ];
  for (const [text, expected] of examples) {
    const ranked = scoreScenarios(text).map(({ scenario }) => scenario.id);
    assert.equal(ranked[0], expected, text);
    if (text.includes("不做")) assert.ok(!ranked.includes("video"), text);
  }
});

test("动态能力：必需角色在候选被手动排除后顺延，不引入首要场景禁止的能力", () => {
  const profile = makeProfile({
    writing: { skills: ["excluded-writer", "backup-writer"] },
    "code-intel": { skills: ["code-review-helper"] },
  });
  hydrateCatalog(profile);
  const store = { ...emptyStore(), overrides: { "skill:excluded-writer": "none" }, known: {
    "skill:code-review-helper": { description: "公众号博客文章 review helper" },
  } };
  const result = analyzeNeed("写一篇公众号博客文章，审阅一下原稿", store);
  assert.equal(result.intents[0].scenario.id, "article");
  assert.deepEqual(result.skills.map(({ skill }) => skill), ["backup-writer"]);
});

test("描述含糊时不能只因句子长就推荐进度插件", () => {
  hydrateCatalog(makeProfile({ task: { packages: ["progress-tracker"] } }));
  const text = "甲乙两份我都留下来了，先看看哪个更合适再告诉我";
  const result = analyzeNeed(text, emptyStore());
  assert.equal(result.intents.length, 0);
  assert.deepEqual(result.packages, []);
});

test("能力名额不足时先覆盖必需角色，再考虑其他命中", () => {
  const result = selectByCoverage([
    { id: "cosmetic", score: 99, roles: ["design"], tags: ["visual"] },
    { id: "must-have", score: 1, roles: ["docs"] },
  ], 1, ["design", "visual", "docs"], ["docs"]);
  assert.deepEqual(result.map(({ id }) => id), ["must-have"]);
});

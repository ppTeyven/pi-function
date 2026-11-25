// 两个入口共享证据和显式模型提案；本地不替模型判断项目阶段或选能力。
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXT, isolate, makePi, makeCtx, coreTools, pkgTools, skillInfo, modelAssemblyTools, modelPlan } from "./lib/mock-pi.mjs";

isolate();
const m = await import(EXT);

function fixture(t, { model = { id: "fixture" }, enabled = true } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fn-project-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "HANDOFF.md"), "# 交接\n- [x] 已跑过初版转换和 LSP 调试\n- [ ] 把多音字说明写完\n## 阻塞\n- 样例还需要确认\n");
  const tools = [...coreTools(), ...modelAssemblyTools(), ...pkgTools("pi-lens", ["lens_diagnostics"]), ...pkgTools("manual-kit", ["manual_render", "manual_upload"])];
  const active = [...coreTools().map(t => t.name), ...(enabled ? modelAssemblyTools().map(t => t.name) : []), "lens_diagnostics", "manual_upload"];
  const commands = ["pi-lens-lsp-navigation", "guide-writing"].map(name => ({ name: `skill:${name}`, source: "skill", sourceInfo: skillInfo(name), description: `${name} doc` }));
  const { pi, state } = makePi({ tools, active, commands });
  m.default(pi);
  const entries = [{ type: "compaction", summary: "上次停在初版测试" }];
  const ctx = (opts = {}) => ({ ...makeCtx(state, opts), model, cwd, sessionManager: { getSessionId: () => "same", getBranch: () => entries } });
  const run = (cmd, context = ctx()) => state.commands.get("function").handler(cmd, context);
  const tool = (name, input, context = ctx(), signal) => state.registeredTools.find(t => t.name === name).execute("fixture", input, signal, undefined, context);
  return { cwd, tools, commands, active, state, ctx, run, tool, entries };
}

const startTurn = (env, message, context) => env.state.handlers.before_agent_start[0]({ messageType: "custom", message, systemPrompt: "base" }, context);
async function openRequest(env, cmd, context = env.ctx()) {
  await env.run(cmd, context);
  const message = env.state.modelTurns.at(-1);
  assert.ok(message?.content, "必须交给模型，不可退回本地提案");
  assert.ok(message.details?.token, "宿主保有自己的回合标记");
  assert.ok(!message.content.includes(message.details.token), "模型文本不得带内部编号");
  assert.doesNotMatch(message.content, /requestId|装配请求 ID/);
  await startTurn(env, message, context);
  return message;
}

const progress = { stage: "模型判断：交付说明阶段", goal: "写供用户验收的说明", done: ["转换测试完成"], openTasks: ["收尾文档"], blockers: ["尚无最终样例"], nextSteps: ["补例并校对"], evidence: ["HANDOFF.md"] };
const docsPlan = () => modelPlan({ standalone: undefined, workflow: "research", plugins: ["npm:manual-kit"], tools: ["manual_render"], skills: ["guide-writing"], gaps: ["缺最终验收样例"], progress });
const persisted = () => [process.env.PI_FUNCTION_STORE, process.env.PI_FUNCTION_PROFILE].map(file => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

test("resume 与需求读取同一份证据，并不预判进度、工作流或能力", async (t) => {
  const env = fixture(t);
  const before = persisted();
  const a = await openRequest(env, "resume");
  const aData = await env.tool("suggest_scenario", {});
  env.state.handlers.agent_settled[0]({}, env.ctx());
  const need = "把多音字处理结果整理给新同事";
  const b = await openRequest(env, need);
  const bData = await env.tool("suggest_scenario", {});
  assert.ok(!aData.isError && !bData.isError);
  assert.match(a.content, /无额外需求/);
  assert.ok(!a.content.includes(need));
  assert.ok(b.content.includes(`需求：${need}`));
  assert.match(b.content, /按该环节的验收目标选场景，不被文案、图表等产物形式带偏/);
  assert.match(b.content, /不得把用户要验收的可运行功能降成只写文档或规则/);
  assert.match(b.content, /手动预设是参考/);
  assert.match(b.content, /先提交能确定的最小装配；把未取得的材料列为执行前阻塞/);
  assert.match(b.content, /主要目标、核心能力或必要授权未定/);
  assert.match(b.content, /只用普通回复问一个会改变装配的问题；不调用 assemble_scenario，不为提问启用 ask/);
  assert.match(b.content, /只用装配工具，不用其他工具搜索或试做任务/);
  assert.ok(!JSON.stringify(bData).includes(b.details.token));
  for (const tool of env.state.registeredTools) assert.ok(!Object.hasOwn(tool.parameters.properties, "requestId"));
  assert.deepEqual(aData.details, bData.details);
  assert.match(bData.details.project.documents[0].excerpt, /\[x\].*转换.*\[ \].*多音字/s);
  assert.match(aData.details.project.recentSession, /初版测试/);
  assert.ok(!("stage" in aData.details.project));
  assert.ok(!("ranked" in aData.details));
  assert.equal(env.state.selectCalls.length, 0, "不先用本地工作流选择覆盖模型判断");
  assert.equal(env.state.setCalls.length, 0);
  assert.deepEqual(persisted(), before);
});

test("缺模型、工具或 UI 时只展示证据；不猜测、不自动补开", async (t) => {
  for (const [config, options] of [[{ model: null }, {}], [{ enabled: false }, {}], [{}, { hasUI: false }]]) {
    const env = fixture(t, config);
    const before = persisted();
    for (const cmd of ["resume", "把原文留在输入框，不发送"]) await env.run(cmd, env.ctx(options));
    assert.equal(env.state.messages.filter(m => m.customType === "function-project").length, 2);
    assert.ok(!env.state.messages.some(m => m.content.includes("把原文留在输入框，不发送")));
    assert.equal(env.state.modelTurns.length, 0);
    assert.equal(env.state.setCalls.length, 0);
    assert.equal(env.state.entries.length, 0);
    assert.deepEqual(persisted(), before);
  }
});

test("两种入口按完整模型提案确认启停，取消时不保存也不改工具", async (t) => {
  for (const cmd of ["resume", "编写文档使用手册"]) {
    const env = fixture(t);
    const before = persisted();
    for (const approve of [false, true]) {
      const current = env.ctx();
      await openRequest(env, cmd, current);
      const plan = docsPlan();
      assert.equal((await env.tool("assemble_scenario", plan, current)).isError, true, "未查事实不得提交");
      await env.tool("suggest_scenario", {}, current);
      current.ui.confirm = async (_title, text) => {
        assert.match(text, /模型判断：交付说明阶段/);
        assert.match(text, /工具将新增启用：manual_render/);
        assert.match(text, /工具将停用：.*lens_diagnostics.*manual_upload/);
        assert.match(text, /插件工具将全部停用：npm:pi-lens/);
        assert.match(text, /会话技能将停用：pi-lens-lsp-navigation/);
        assert.match(text, /缺最终验收样例/);
        assert.deepEqual(env.state.active, env.active);
        const concurrent = await env.tool("assemble_scenario", plan, current);
        assert.match(concurrent.content[0].text, /已提交/, "等待确认期间不能再打开一次确认");
        return approve;
      };
      const res = await env.tool("assemble_scenario", plan, current);
      assert.equal((await env.tool("assemble_scenario", plan, current)).isError, true, "禁止重放已提交提案");
      if (!approve) {
        assert.equal(res.details.cancelled, true);
        assert.deepEqual(persisted(), before);
        assert.equal(env.state.setCalls.length, 0);
        assert.equal(env.state.entries.length, 0);
        if (cmd !== "resume") assert.equal(env.state.editorText, cmd);
        continue;
      }
      assert.ok(!res.isError, res.content[0].text);
      assert.equal(res.details.workflow, "research");
      assert.deepEqual(res.details.enabled, ["manual_render"]);
      assert.deepEqual(res.details.disabled, ["lens_diagnostics", "manual_upload"]);
      assert.deepEqual(res.details.disabledSkills, ["pi-lens-lsp-navigation"]);
      assert.deepEqual(env.state.entries.at(-1).d.tools, env.state.active);
      assert.deepEqual(m.loadStore().active.custom.plan.tools, ["manual_render"]);
      const prompt = { systemPrompt: "base", systemPromptOptions: { skills: env.commands.map(c => ({ name: c.name.slice(6) })) } };
      await env.state.handlers.before_agent_start[0](prompt, current);
      assert.deepEqual(prompt.systemPromptOptions.skills.map(s => s.name), ["guide-writing"]);
      assert.deepEqual(await env.state.handlers.input[0]({ text: "/skill:pi-lens-lsp-navigation" }, current), { action: "handled" });
      await env.run("off", current);
      assert.equal(await env.state.handlers.input[0]({ text: "/skill:pi-lens-lsp-navigation" }, current), undefined);
    }
  }
});

test("宿主必须启动真实回合：错标记、跨会话、跨工作区和取消信号不授权读取或提案", async (t) => {
  const env = fixture(t);
  const current = env.ctx();
  const foreign = { ...current, sessionManager: { getSessionId: () => "different" } };
  const otherCwd = { ...current, cwd: path.join(env.cwd, "other") };
  await env.run("resume", current);
  const message = env.state.modelTurns.at(-1);
  assert.ok(message);
  assert.equal((await env.tool("suggest_scenario", {}, current)).isError, true, "入队不等于启动模型回合");
  await startTurn(env, { ...message, details: { token: "wrong" } }, current);
  assert.equal((await env.tool("suggest_scenario", {}, current)).isError, true);
  assert.equal((await env.tool("assemble_scenario", modelPlan(), current)).isError, true, "错标记也不能降级为独立装配");
  await startTurn(env, message, current);
  for (const wrong of [foreign, otherCwd]) {
    assert.equal((await env.tool("suggest_scenario", {}, wrong)).isError, true);
    assert.equal((await env.tool("assemble_scenario", docsPlan(), wrong)).isError, true);
  }
  assert.equal((await env.tool("assemble_scenario", modelPlan(), current)).isError, true);
  const aborted = AbortSignal.abort();
  assert.equal((await env.tool("suggest_scenario", {}, current, aborted)).isError, true);
  assert.equal((await env.tool("assemble_scenario", docsPlan(), current, aborted)).isError, true);
  assert.equal(env.state.handlers.tool_call[0]({ toolName: "bash" }, current).block, true);
  assert.deepEqual(env.state.active, env.active);
});

test("目录变化拒绝旧计划；回合结束或触发消息重放均不能再次装配", async (t) => {
  const env = fixture(t);
  const current = env.ctx();
  const message = await openRequest(env, "resume", current);
  await env.tool("suggest_scenario", {}, current);
  current.ui.confirm = async () => { env.state.tools.splice(env.state.tools.findIndex(t => t.name === "manual_render"), 1); return true; };
  const res = await env.tool("assemble_scenario", docsPlan(), current);
  assert.equal(res.details.cancelled, true);
  env.state.handlers.agent_settled[0]({}, current);
  assert.ok(!(await env.tool("suggest_scenario", {}, current)).details.project, "普通调用不再看到过期项目证据");
  assert.equal((await env.tool("assemble_scenario", docsPlan(), current)).isError, true);
  assert.equal((await env.tool("assemble_scenario", { ...docsPlan(), standalone: true }, current)).isError, true);
  await startTurn(env, message, current);
  assert.equal((await env.tool("suggest_scenario", {}, current)).isError, true);
  assert.equal((await env.tool("assemble_scenario", modelPlan(), current)).isError, true);
  assert.equal(env.state.handlers.tool_call[0]({ toolName: "bash" }, current).block, true);
  env.state.handlers.agent_settled[0]({}, current);
  assert.equal(env.state.handlers.tool_call[0]({ toolName: "bash" }, current), undefined);
  assert.deepEqual(env.state.active, env.active);
  assert.equal(env.state.setCalls.length, 0);
});

test("恢复只应用存档里确认过的模型清单，不用新文档或分类器补选", async (t) => {
  const env = fixture(t);
  const ctx = env.ctx({ confirms: [true] });
  await openRequest(env, "resume", ctx);
  await env.tool("suggest_scenario", {}, ctx);
  const applied = await env.tool("assemble_scenario", docsPlan(), ctx);
  assert.ok(!applied.isError, applied.content[0].text);
  const last = env.state.entries.at(-1).d;
  fs.writeFileSync(path.join(env.cwd, "HANDOFF.md"), "- [ ] 开发 Pi 插件，分析 LSP 错误");
  const { pi, state } = makePi({ tools: env.tools, active: env.active, commands: env.commands });
  m.default(pi);
  const reload = { ...makeCtx(state), cwd: env.cwd, sessionManager: { getSessionId: () => "same", getBranch: () => [{ type: "custom", customType: "function-scenario", data: last }] } };
  await state.handlers.before_agent_start[0]({ systemPrompt: "base" }, reload);
  assert.deepEqual(state.active, applied.details.tools);
  assert.equal(state.entries.length, 0, "恢复不重新提交或增加统计");
});

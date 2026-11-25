// Use the configured Pi model and the actual extension commands/tools. No plan is approved.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import functionMenu from "../function-menu.js";

const { values } = parseArgs({ options: { out: { type: "string" }, sdk: { type: "string" }, case: { type: "string" }, limit: { type: "string" }, resume: { type: "boolean" }, diagnose: { type: "boolean" } } });
const here = name => new URL(name, import.meta.url);
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sdkFile = values.sdk || (process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@agegr", "pi-web", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js"));

function saveCheckpoint(file, record) {
  const partial = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(partial, JSON.stringify(record, null, 2) + "\n", { flag: "wx", flush: true });
    fs.renameSync(partial, file);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

// Only record visible model text and tool protocol events, never reasoning blocks or raw prompts.
function describeOutcome(entries, plan) {
  const messages = entries.filter(entry => entry.type === "message").map(entry => entry.message);
  const blocks = (content) => Array.isArray(content) ? content : [];
  const textOf = (content) => typeof content === "string" ? content
    : blocks(content).filter(part => part.type === "text").map(part => part.text).join("\n");
  const assistant = messages.filter(msg => msg.role === "assistant");
  const requestPrompt = messages.filter(msg => msg.role === "user").map(msg => textOf(msg.content))
    .findLast(text => text.startsWith("装配请求 ID："));
  const requestId = /^装配请求 ID：([^\r\n]+)/.exec(requestPrompt ?? "")?.[1];
  const results = new Map(messages.filter(msg => msg.role === "toolResult").map(msg => [msg.toolCallId, msg]));
  const calls = assistant.flatMap(msg => blocks(msg.content).filter(part => part.type === "toolCall")).map(call => {
    const result = results.get(call.id);
    const state = !result ? "no-result" : result.isError ? "error" : "ok";
    const binding = ["suggest_scenario", "assemble_scenario"].includes(call.name) && (requestId || call.arguments?.requestId !== undefined)
      ? (call.arguments?.requestId === undefined ? "omitted" : !requestId ? "unexpected" : call.arguments.requestId === requestId ? "matched" : "mismatched")
      : null; // 新版正常调用由宿主绑定，不把没有模型 ID 当成遗漏。
    return { tool: call.name, state, ...(binding ? { requestIdBinding: binding } : {}),
      ...(state === "error" ? { error: textOf(result.content).slice(0, 1000) } : {}) };
  });
  const attempted = calls.filter(call => call.tool === "assemble_scenario");
  const final = assistant.at(-1);
  return {
    outcome: plan ? "validated" : attempted.some(call => call.state === "error") ? "proposal-rejected"
      : attempted.length ? "proposal-without-validation" : "no-proposal-call",
    calls,
    final: final ? { stopReason: final.stopReason, text: textOf(final.content).slice(0, 1200) } : null,
  };
}

async function capture() {
  assert.ok(values.out && sdkFile, "Supply --out <capture.json>; supply --sdk <Pi SDK dist/index.js> if not using Windows pi-web.");
  assert.ok(!values.diagnose || values.case, "--diagnose requires --case <id>; diagnostic output cannot be used for the release gate.");
  assert.equal(fs.existsSync(values.out), Boolean(values.resume), values.resume ? "No checkpoint to resume." : "Output exists; use --resume or choose a new path.");
  const limit = values.limit === undefined ? 33 : Number(values.limit);
  assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= 33, "--limit must be between 1 and 33.");
  assert.ok(!Object.keys(process.env).some(key => /^(http|https|all)_proxy$/i.test(key)), "Proxy environment detected; no request sent.");
  const bytes = fs.readFileSync(here("g3-g4-v1.json"));
  const datasetSha = sha256(bytes);
  const implementationSha = sha256(fs.readFileSync(here("../function-menu.js")));
  assert.equal(datasetSha, fs.readFileSync(here("g3-g4-v1.sha256"), "utf8").trim());
  // Only the input text and synthetic catalog metadata enter the host. No labels are sent.
  const fixture = JSON.parse(bytes);
  const inputs = fixture.cases.filter(({ id }) => !values.case || id === values.case).map(({ id, text }) => ({ id, text }));
  assert.ok(inputs.length, "Unknown case id.");
  const sdkUrl = pathToFileURL(path.resolve(sdkFile));
  const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(sdkUrl.href);
  const { AuthStorage } = await import(new URL("core/auth-storage.js", sdkUrl).href);
  const { emitSessionShutdownEvent } = await import(new URL("core/extensions/runner.js", sdkUrl).href);
  const userDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  const config = readJson(path.join(userDir, "settings.json"));
  const { defaultProvider: provider, defaultModel: modelId, defaultThinkingLevel } = config;
  assert.ok(provider && modelId, "Pi has no configured default provider/model. No model was substituted.");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fn-live-gate-"));
  try {
    const workspace = path.join(tmp, "workspace");
    const agentDir = path.join(tmp, ".pi", "agent");
    fs.mkdirSync(workspace);
    fs.mkdirSync(agentDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_FUNCTION_STORE = path.join(tmp, "store.json");
    process.env.PI_FUNCTION_PROFILE = path.join(tmp, "profile.json");
    const authPath = path.join(userDir, "auth.json");
    const credentials = AuthStorage.inMemory(fs.existsSync(authPath) ? readJson(authPath) : {});
    const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: path.join(userDir, "models.json"), modelsStorePath: path.join(tmp, "models-store.json"), allowModelNetwork: false });
    const model = modelRuntime.getModel(provider, modelId);
    assert.ok(model, `Configured model ${provider}/${modelId} is not registered by this SDK.`);
    assert.ok(modelRuntime.hasConfiguredAuth(provider), `No usable credential configured for ${provider}.`);
    const host = new URL(model.baseUrl).hostname;
    assert.ok(!/(proxy|gateway|relay)/i.test(host), "Configured model endpoint appears to be a proxy/gateway/relay; no request sent.");
    const identity = { version: 1, origin: values.diagnose ? "pi-sdk-llm-diagnostic" : "pi-sdk-real-llm", model: { provider, id: modelId, thinking: defaultThinkingLevel ?? null }, datasetSha, implementationSha };
    const record = values.resume ? readJson(values.out) : { ...identity, cases: [] };
    const { cases, ...savedIdentity } = record;
    assert.deepEqual(savedIdentity, identity, "Checkpoint dataset, implementation or model settings do not match. Use a new path.");
    const completed = new Set(cases.map(row => row.id));
    assert.equal(completed.size, cases.length, "Checkpoint contains duplicate case IDs.");
    assert.ok(cases.every(row => fixture.cases.some(x => x.id === row.id) && Object.hasOwn(row, "plan")), "Checkpoint contains invalid cases.");
    const pending = inputs.filter(({ id }) => !completed.has(id)).slice(0, limit);
    console.log(`Model: ${provider}/${modelId} @ ${host}; ${pending.length} new public/synthetic case(s), ${completed.size}/33 already captured. No proposals will be approved.`);
    if (!values.resume) fs.writeFileSync(values.out, JSON.stringify(record, null, 2) + "\n", { flag: "wx", flush: true });
    if (!pending.length) return;
    const packageDir = path.join(agentDir, "npm");
    const extensions = [];
    for (const [i, row] of fixture.catalog.entries()) {
      const pkg = path.join(packageDir, "node_modules", row.package);
      const skill = path.join(agentDir, "skills", row.skill);
      fs.mkdirSync(pkg, { recursive: true });
      fs.mkdirSync(skill, { recursive: true });
      fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: row.package, version: "1.0.0", description: row.description }));
      const file = path.join(pkg, "fixture.mjs");
      fs.writeFileSync(file, `export default pi => pi.registerTool({name:"release_fixture_${i}",label:${JSON.stringify(row.role)},description:${JSON.stringify(row.description)},parameters:{type:"object",properties:{}},async execute(){throw Error("Fixture must not run")}});`);
      extensions.push(file);
      fs.writeFileSync(path.join(skill, "SKILL.md"), `---\nname: ${row.skill}\ndescription: ${JSON.stringify(row.description)}\n---\nEvaluation fixture. Do not execute.\n`);
    }
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ dependencies: Object.fromEntries(fixture.catalog.map(row => [row.package, "1.0.0"])) }));
    for (const { id, text } of pending) {
      const settingsManager = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
      const resourceLoader = new DefaultResourceLoader({ cwd: workspace, agentDir, settingsManager, extensionFactories: [functionMenu], additionalExtensionPaths: extensions, noPromptTemplates: true, noThemes: true });
      await resourceLoader.reload();
      const sessionManager = SessionManager.inMemory(workspace);
      const { session } = await createAgentSession({ cwd: workspace, agentDir, model, modelRuntime, thinkingLevel: defaultThinkingLevel, settingsManager, resourceLoader, sessionManager });
      let timer, unsubscribe, extensionError = false, confirmations = 0;
      try {
        await session.bindExtensions({ mode: "interactive", onError: () => { extensionError = true; }, uiContext: { notify: () => {}, confirm: async () => { confirmations++; return false; } } });
        const before = session.getActiveToolNames();
        const done = new Promise((resolve, reject) => {
          unsubscribe = session.subscribe(event => { if (event.type === "agent_settled") resolve(); });
          timer = setTimeout(() => reject(new Error(`${id}: model did not settle in 120 seconds`)), 120000);
        });
        await session.prompt(`/function “${text}”`);
        assert.ok(!extensionError, `${id}: extension failed to start the model turn.`);
        await done;
        assert.ok(!extensionError, `${id}: extension failed during the model turn.`);
        assert.deepEqual(session.getActiveToolNames(), before);
        const entries = sessionManager.getBranch();
        const reports = entries.filter(entry => entry.type === "custom_message" && entry.customType === "function-proposal");
        const plan = reports.at(-1)?.details?.plan ?? null;
        assert.ok(!plan || confirmations === 1);
        const error = entries.findLast(entry => entry.type === "message" && entry.message?.role === "assistant" && entry.message?.stopReason === "error");
        if (error) {
          const explanation = String(error.message.errorMessage || "");
          const code = explanation.match(/\b(?:401|403|404|429|5\d\d|ECONNRESET|ETIMEDOUT)\b/)?.[0] || "unknown";
          throw new Error(`${id}: model request failed (${code}); no cases fabricated or provider switched.`);
        }
        assert.equal(sha256(fs.readFileSync(here("../function-menu.js"))), implementationSha, "Implementation changed during capture; cannot attach new results to this checkpoint.");
        const diagnostic = values.diagnose || !plan ? describeOutcome(entries, plan) : null;
        cases.push({ id, plan, ...(diagnostic ? { diagnostic } : {}) });
        cases.sort((a, b) => a.id.localeCompare(b.id));
        saveCheckpoint(values.out, record);
        console.log(`${id}: ${plan ? `validated proposal (${plan.scenario}), declined by fixture` : diagnostic.outcome} · saved ${cases.length}/33`);
      } finally {
        clearTimeout(timer);
        unsubscribe?.();
        await session.abort().catch(() => {});
        await emitSessionShutdownEvent(session.extensionRunner, { type: "session_shutdown", reason: "quit" });
        session.dispose();
      }
    }
    if (values.diagnose) console.log("Diagnostic capture only. It cannot replace a release benchmark result.");
    else if (cases.length < fixture.cases.length) console.log("Partial checkpoint saved. Continue with --resume --out <same path>.");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

try { await capture(); }
catch (error) { console.error(`Capture stopped: ${error.message}`); process.exitCode = 2; }

// 测试夹具：把 store / profile 指到临时目录，并用**显式构造**的 profile 驱动场景，
// 不依赖本机真实 store 快照（真实会话有 watcher 在写，结果不可复现）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export let AGENT_DIR;
// 仓库内测试直接加载本仓库的扩展（不依赖 ~/.pi/agent 里的安装副本）
export const EXT = new URL("../../function-menu.js", import.meta.url).href;

/** 隔离 store / profile，返回临时目录 */
export function isolate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-fn-enable-"));
  // 发现/归属测试也必须隔离：空机器上没有开发者的 npm 包、本地扩展或技能。
  AGENT_DIR = path.join(dir, ".pi", "agent");
  process.env.PI_CODING_AGENT_DIR = AGENT_DIR;
  const pkg = path.join(AGENT_DIR, "npm", "node_modules", "pi-lens");
  const skill = path.join(AGENT_DIR, "skills", "pi-lens-lsp-navigation");
  fs.mkdirSync(pkg, { recursive: true });
  fs.mkdirSync(skill, { recursive: true });
  fs.mkdirSync(path.join(AGENT_DIR, "extensions"));
  fs.writeFileSync(path.join(AGENT_DIR, "npm", "package.json"), JSON.stringify({ dependencies: { "pi-lens": "1.0.0" } }));
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "pi-lens", version: "1.0.0", description: "LSP code intelligence" }));
  fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: pi-lens-lsp-navigation\ndescription: LSP diagnostics and code navigation\n---\n");
  fs.writeFileSync(path.join(AGENT_DIR, "extensions", "function-menu.js"), "// discovery fixture\n");
  process.env.PI_FUNCTION_STORE = path.join(dir, "function-menu.json");
  process.env.PI_FUNCTION_PROFILE = path.join(dir, "function-menu.profile.json");
  return dir;
}

/* ------------------------------ sourceInfo ------------------------------ */
const SI = (p, source, origin = "package") => ({ path: p, source, scope: "user", origin });

/** npm 包的 sourceInfo（真实形状：path 在 agent/npm/node_modules 下，source = npm:<name>） */
export const npmInfo = (pkg, file = "dist/index.js") => {
  const base = String(pkg).replace(/^npm:/, "");
  return SI(`${AGENT_DIR}/npm/node_modules/${base}/${file}`, `npm:${base}`);
};
/** 内置工具 */
export const builtinInfo = (name) => SI(`builtin:${name}`, "builtin");
/** 本地扩展（~/.pi/agent/extensions/*.js） */
export const localInfo = (file = "function-menu.js") =>
  SI(`${AGENT_DIR}/extensions/${file}`, `local:${file.replace(/\.(js|ts)$/, "")}`, "top-level");
/** skills 目录下的独立技能（sourceInfo 指向 SKILL.md，不在 node_modules） */
export const skillInfo = (name) =>
  SI(`${AGENT_DIR}/skills/${name}/SKILL.md`, "skill", "top-level");

/* -------------------------------- 工具 -------------------------------- */
export const tool = (name, sourceInfo, description = "") => ({
  name,
  description: description || `tool ${name}`,
  parameters: {},
  sourceInfo,
});

/** 核心 7 个工具（真实 pi 一定注册的） */
export const coreTools = () =>
  ["read", "bash", "edit", "write", "grep", "find", "ls"].map((n) => tool(n, builtinInfo(n)));

/** 一个包带一组工具 */
export const pkgTools = (pkg, names, file) => names.map((n) => tool(n, npmInfo(pkg, file)));

/* -------------------------------- mock pi -------------------------------- */
export function makePi({ tools = [], commands = [], active = null, settings = {} } = {}) {
  const state = {
    active: active ? [...active] : tools.map((t) => t.name),
    setCalls: [],
    entries: [],
    messages: [],
    notices: [],
    registeredTools: [],
    // 点按选择记录：{title, options}，用于断言菜单内容与排序
    selectCalls: [],
    editorText: null,
    userMessages: [],
    handlers: {},
    editorWrites: 0,
    commands: new Map(),
    tools,
    commandList: commands,
  };
  const pi = {
    registerTool(t) { state.registeredTools.push(t); },
    registerCommand(name, cmd) { state.commands.set(name, cmd); },
    registerOption() {},
    on(event, fn) { (state.handlers[event] = state.handlers[event] || []).push(fn); },
    appendEntry(type, d) { state.entries.push({ type, d }); },
    sendMessage(msg) { state.messages.push(msg); },
    sendUserMessage(text, opts) { state.userMessages = (state.userMessages || []).concat([{ text, opts }]); },
    getAllTools: () => state.tools,
    getActiveTools: () => state.active,
    setActiveTools(next) { state.setCalls.push([...next]); state.active = [...next]; },
    getCommands: () => state.commandList,
    getAllSkills: () => [],
    getSettings: () => settings,
    notify() {},
  };
  return { pi, state };
}

/** ctx.ui 队列：input 收编号字符串，select 收选项，confirm 收布尔 */
export function makeCtx(state, { inputs = [], selects = [], confirms = [], hasUI = true } = {}) {
  return {
    hasUI,
    cwd: process.cwd(),
    ui: {
      notify(t, l) { state.notices.push({ text: String(t), level: l }); },
      input: async () => inputs.shift() ?? null,
      select: async (title, options) => {
        const list = [...(options || [])];
        state.selectCalls.push({ title: String(title), options: list });
        const v = selects.shift();
        if (v !== undefined) return v;
        // 三选确认（askYesNoCancel）在测试里沿用 confirms 队列：true=是，false=否
        if (list.some((o) => String(o).startsWith("✕ 取消"))) {
          const c = confirms.shift();
          if (c !== undefined) return c ? list[0] : list[1];
        }
        return undefined;
      },
      confirm: async () => confirms.shift() ?? false,
      setEditorText(text) { state.editorText = String(text); state.editorWrites = (state.editorWrites || 0) + 1; },
    },
  };
}

/** 上次 ctx 里 notify 的纯文本，便于断言 */
export const noticeText = (state) => state.notices.map((n) => n.text).join("\n");

/* -------------------------------- profile -------------------------------- */
/**
 * 显式画像：{ 角色id: { packages:[], skills:[], network?, infra? } }
 * hydrateCatalog 用它改写每个场景的 plugins / skillIds，测试因此完全确定。
 */
export function makeProfile(spec) {
  const roles = {};
  const itemInfo = {};
  for (const [roleId, s] of Object.entries(spec)) {
    const infra = !!s.infra;
    roles[roleId] = {
      id: roleId,
      label: s.label || roleId,
      network: !!s.network,
      infra,
      packages: (s.packages || []).map((id) => ({ id, score: 5, reasons: [] })),
      skills: (s.skills || []).map((id) => ({ id, score: 5, reasons: [] })),
    };
    for (const id of s.packages || []) {
      itemInfo[id] = { id, kind: "plugin", description: `${id} 插件`, roles: [roleId], tags: [], infra, network: !!s.network };
    }
    for (const id of s.skills || []) {
      itemInfo[id] = { id, kind: "skill", description: `${id} 技能`, roles: [roleId], tags: [], infra, network: !!s.network };
    }
  }
  return { version: 1, fingerprint: "test", generatedAt: "2026-01-01T00:00:00.000Z", roles, itemInfo, unassigned: [], counts: {} };
}

/** 把 profile 灌进模块并返回场景对象 */
export function hydrate(mod, spec) {
  const profile = makeProfile(spec);
  mod.hydrateCatalog(profile);
  return profile;
}

export const scenario = (mod, id) => {
  const s = mod.SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
};
export const workflow = (mod, id) => {
  const w = mod.WORKFLOWS.find((x) => x.id === id);
  if (!w) throw new Error(`unknown workflow ${id}`);
  return w;
};

/** 空 store（applyScenario 会写 usage/active，需要对象） */
export const emptyStore = () => ({ version: 1, known: {}, overrides: {}, usage: {}, itemUse: {}, manualAdds: {} });

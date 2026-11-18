// 测试引导：默认加载仓库内 fixture，任何机器都能跑出同样结果；
// 只有显式设置 PI_FUNCTION_REAL_STORE=1 时才去读本机真实目录（用于环境体检）。
// 导入顺序：先 import 本模块（设置环境变量），再 import ../function-menu.js。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const EXT = new URL("../function-menu.js", import.meta.url).href;
export const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
export const REAL_STORE = path.join(AGENT_DIR, "function-menu.json");
export const FIXTURE = path.join(here, "fixtures", "store.json");
export const USE_REAL = process.env.PI_FUNCTION_REAL_STORE === "1";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-function-test-"));
export const STORE = path.join(dir, "function-menu.json");
export const PROFILE = path.join(dir, "function-menu.profile.json");

const source = USE_REAL && fs.existsSync(REAL_STORE) ? REAL_STORE : FIXTURE;
const data = JSON.parse(fs.readFileSync(source, "utf8"));
// 可用性由 auditPackages 实时判断，快照里的 missing 一律清零，保证可复现
for (const meta of Object.values(data.known || {})) meta.missing = false;
fs.writeFileSync(STORE, JSON.stringify(data, null, 2));

process.env.PI_FUNCTION_STORE = STORE;
process.env.PI_FUNCTION_PROFILE = PROFILE;

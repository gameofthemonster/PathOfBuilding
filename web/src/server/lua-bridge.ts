import { type Subprocess } from "bun"
import path from "path"

const REPO_ROOT = path.resolve(import.meta.dir, "../../..")

export interface LuaResult {
  stats: Record<string, number>
  warnings: string[]
  error?: string
}

/**
 * 向单个 LuaJIT 进程发送 XML 并读取 JSON 响应。
 * 使用长度前缀协议：`<字节数>\n<XML内容>`
 */
export async function sendToLua(
  proc: Subprocess<"pipe", "pipe", "pipe">,
  xml: string
): Promise<LuaResult> {
  const encoder = new TextEncoder()
  const xmlBytes = encoder.encode(xml)

  // 发送长度前缀
  const prefix = encoder.encode(`${xmlBytes.byteLength}\n`)
  proc.stdin.write(prefix)
  await proc.stdin.flush()

  // 发送 XML 内容
  proc.stdin.write(xmlBytes)
  await proc.stdin.flush()

  // 读取一行 JSON 响应
  const reader = proc.stdout.getReader()
  let response = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) throw new Error("LuaJIT process stdout closed unexpectedly")
    const chunk = new TextDecoder().decode(value)
    response += chunk
    if (response.includes("\n")) break
  }
  reader.releaseLock()

  const line = response.split("\n")[0].trim()
  return JSON.parse(line) as LuaResult
}

/**
 * 启动一个 LuaJIT 进程并返回它。
 */
export function spawnLuaProcess(): Subprocess<"pipe", "pipe", "pipe"> {
  const srcDir = path.join(REPO_ROOT, "src")
  const scriptPath = path.join(REPO_ROOT, "web", "lua", "server_calc.lua")

  // 清除 CI 环境变量（否则 POB 会跳过 ModCache 导致计算错误）
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== "CI" && v !== undefined) {
      env[k] = v
    }
  }
  env["LUA_PATH"] = "../runtime/lua/?.lua;../runtime/lua/?/init.lua"
  env["LUA_CPATH"] = "../runtime/lua/?.so"

  return Bun.spawn(["luajit", scriptPath], {
    cwd: srcDir,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
}

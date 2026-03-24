import { WorkerPool } from "./worker-pool"
import { SessionStore } from "./session-store"
import { decodeBuildString } from "./decode"
import { parseBuildXml } from "./xml-parser"
import { applyPatch, type BuildPatch } from "./xml-patcher"
import { loadTranslations } from "./i18n-loader"
import { randomUUID } from "crypto"
import { readdirSync } from "fs"
import { join } from "path"
import index from "../../index.html"

const FIXTURES_DIR = join(import.meta.dir, "../../test/fixtures")
const REPO_ROOT = join(import.meta.dir, "../../../..")

const PORT = parseInt(process.env["PORT"] ?? "3000", 10)
const POOL_SIZE = parseInt(process.env["POOL_SIZE"] ?? "4", 10)

const pool = new WorkerPool(POOL_SIZE)
const sessions = new SessionStore()

// 树数据缓存
let treeDataCache: unknown[] | null = null

async function getTreeDataCached(): Promise<unknown[]> {
  if (treeDataCache) return treeDataCache
  const treeDataPath = join(REPO_ROOT, "web/tree-data.json")
  const file = Bun.file(treeDataPath)
  if (await file.exists()) {
    treeDataCache = await file.json()
    return treeDataCache!
  }
  return []
}

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...")
  pool.shutdown()
  sessions.destroy()
  process.exit(0)
})

interface RouteRequest extends Request {
  params: Record<string, string>
}

// 预热进程池，然后启动 HTTP 服务
console.log("[Server] Warming up LuaJIT worker pool...")
pool.warmup().then(() => {
  console.log(`[Server] Listening on http://localhost:${PORT}`)

  Bun.serve({
    port: PORT,
    routes: {
      "/": index,
      "/api/fixtures": { GET: handleListFixtures },
      "/api/fixtures/:name": { GET: (req) => handleGetFixture(req as RouteRequest) },
      "/api/calculate": { POST: handleCalculate },
      "/api/recalculate": { POST: handleRecalculate },
      "/api/tree-data": { GET: async () => jsonResponse(await getTreeDataCached(), 200) },
      "/api/i18n": { GET: handleI18n },
    },
    development: {
      hmr: true,
      console: true,
    },
  })
}).catch((err) => {
  console.error("[Server] Failed to start:", err)
  process.exit(1)
})

function handleListFixtures(): Response {
  try {
    const files = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".build"))
      .map((f) => f.replace(/\.build$/, ""))
    return jsonResponse({ fixtures: files }, 200)
  } catch {
    return jsonResponse({ fixtures: [] }, 200)
  }
}

async function handleGetFixture(req: RouteRequest): Promise<Response> {
  const name = req.params.name
  if (name.includes("/") || name.includes("..")) {
    return jsonResponse({ error: "Invalid fixture name" }, 400)
  }
  const filePath = join(FIXTURES_DIR, `${name}.build`)
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return jsonResponse({ error: "Fixture not found" }, 404)
  }
  const content = await file.text()
  return new Response(content.trim(), {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

async function handleCalculate(req: Request): Promise<Response> {
  let body: { buildCode?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  if (!body.buildCode || typeof body.buildCode !== "string") {
    return jsonResponse({ error: "Missing buildCode" }, 400)
  }

  // 1. 解码 build string → XML
  let xml: string
  try {
    xml = decodeBuildString(body.buildCode)
  } catch (err) {
    return jsonResponse({ error: `Failed to decode build string: ${String(err)}` }, 400)
  }

  // 2. 解析 XML → BuildConfig
  let buildConfig
  try {
    buildConfig = parseBuildXml(xml)
  } catch (err) {
    return jsonResponse({ error: `Failed to parse XML: ${String(err)}` }, 400)
  }

  // 3. 发送到 LuaJIT 计算
  let result
  try {
    result = await pool.calculate(xml)
  } catch (err) {
    return jsonResponse({ error: `Calculation failed: ${String(err)}` }, 500)
  }

  // 4. 存储会话（供 recalculate 使用）
  const sessionId = randomUUID()
  sessions.set(sessionId, xml)

  return jsonResponse({ sessionId, buildConfig, result }, 200)
}

async function handleRecalculate(req: Request): Promise<Response> {
  let body: { sessionId?: string; patch?: BuildPatch }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  if (!body.sessionId) {
    return jsonResponse({ error: "Missing sessionId" }, 400)
  }

  const originalXml = sessions.get(body.sessionId)
  if (!originalXml) {
    return jsonResponse({ error: "Session not found or expired" }, 404)
  }

  // 应用 patch（如果有），否则用原始 XML
  let xml: string
  if (body.patch) {
    try {
      xml = applyPatch(originalXml, body.patch)
    } catch (err) {
      return jsonResponse({ error: `Failed to apply patch: ${String(err)}` }, 400)
    }
  } else {
    xml = originalXml
  }

  let result
  try {
    result = await pool.calculate(xml)
  } catch (err) {
    return jsonResponse({ error: `Recalculation failed: ${String(err)}` }, 500)
  }

  return jsonResponse({ result }, 200)
}

async function handleI18n(): Promise<Response> {
  const map = await loadTranslations()
  return jsonResponse(Object.fromEntries(map), 200)
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

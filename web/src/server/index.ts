import { WorkerPool } from "./worker-pool"
import { SessionStore } from "./session-store"
import { decodeBuildString } from "./decode"
import { parseBuildXml } from "./xml-parser"
import { applyPatch, type BuildPatch } from "./xml-patcher"
import { loadTranslations } from "./i18n-loader"
import { randomUUID } from "crypto"
import { readdirSync } from "fs"
import { join } from "path"

const FIXTURES_DIR = join(import.meta.dir, "../../test/fixtures")
const WEB_DIR = join(import.meta.dir, "../..")
const REPO_ROOT = join(import.meta.dir, "../../..")
const API_PORT = parseInt(process.env["API_PORT"] ?? "3001", 10)
const DEV_PORT = parseInt(process.env["DEV_PORT"] ?? "3000", 10)
const POOL_SIZE = parseInt(process.env["POOL_SIZE"] ?? "4", 10)

// 找最新树版本目录（格式 3_XX，取数值最大的）
function getLatestTreeVersion(): string {
  try {
    const treeDataDir = join(REPO_ROOT, "src/TreeData")
    const entries = readdirSync(treeDataDir)
    let best = "3_28"
    let bestNum = 0
    for (const e of entries) {
      const m = e.match(/^3_(\d+)$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > bestNum) { bestNum = n; best = e }
      }
    }
    return best
  } catch {
    return "3_28"
  }
}
const TREE_VERSION = getLatestTreeVersion()
const TREE_ASSETS_DIR = join(REPO_ROOT, "src/TreeData", TREE_VERSION)

// Vite 作为用户入口（3000），内置 proxy 将 /api 转发到 Bun（3001）
const viteProc = Bun.spawn(
  ["bun", "node_modules/.bin/vite", "--port", String(DEV_PORT), "--strictPort"],
  {
    cwd: WEB_DIR,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  }
)

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

// 树元数据缓存（groups、orbit 常量、节点 orbit 数据、line 贴图）
let treeMetaCache: unknown | null = null

async function getTreeMetaCached(): Promise<unknown> {
  if (treeMetaCache) return treeMetaCache
  const path = join(REPO_ROOT, "web/tree-meta.json")
  const file = Bun.file(path)
  if (await file.exists()) {
    const data = await file.json()
    treeMetaCache = data
    return data
  }
  return {}
}

// 技能列表缓存
let skillsCache: unknown | null = null

async function getSkillsCached(): Promise<unknown> {
  if (skillsCache) return skillsCache
  const path = join(REPO_ROOT, "web/skills-data.json")
  const file = Bun.file(path)
  if (await file.exists()) {
    const data = await file.json() as unknown[]
    if (Array.isArray(data) && data.length > 0) skillsCache = data
    return data
  }
  return []
}

// Sprite 贴图坐标缓存
let spritesCache: unknown | null = null

async function getSpritesCached(): Promise<unknown> {
  if (spritesCache) return spritesCache
  const path = join(REPO_ROOT, "web/sprites.json")
  const file = Bun.file(path)
  if (await file.exists()) {
    const data = await file.json() as Record<string, unknown>
    // Only cache if data is non-empty (Lua worker may still be initializing)
    if (Object.keys(data).length > 0) spritesCache = data
    return data
  }
  return {}
}

process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...")
  viteProc.kill()
  pool.shutdown()
  sessions.destroy()
  process.exit(0)
})

interface RouteRequest extends Request {
  params: Record<string, string>
}

pool.warmup().then(() => {
  Bun.serve({
    port: API_PORT,
    routes: {
      "/api/fixtures": { GET: handleListFixtures },
      "/api/fixtures/:name": { GET: (req) => handleGetFixture(req as RouteRequest) },
      "/api/calculate": { POST: handleCalculate },
      "/api/recalculate": { POST: handleRecalculate },
      "/api/tree-data": { GET: async () => jsonResponse(await getTreeDataCached(), 200) },
      "/api/tree-meta": { GET: async () => jsonResponse(await getTreeMetaCached(), 200) },
      "/api/sprites": { GET: async () => jsonResponse(await getSpritesCached(), 200) },
      "/api/skills": { GET: async () => jsonResponse(await getSkillsCached(), 200) },
      "/api/i18n": { GET: handleI18n },
      "/tree-assets/:filename": { GET: (req) => handleTreeAsset(req as RouteRequest) },
    },
    fetch() {
      return new Response("Not Found", { status: 404 })
    },
  })
  console.log(`[Server] API ready on http://localhost:${API_PORT}`)
}).catch((err) => {
  console.error("[Server] Failed to start:", err)
  viteProc.kill()
  process.exit(1)
})

// ─── API handlers ──────────────────────────────────────────────────────────

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

  let xml: string
  try {
    xml = decodeBuildString(body.buildCode)
  } catch (err) {
    return jsonResponse({ error: `Failed to decode build string: ${String(err)}` }, 400)
  }

  let buildConfig
  try {
    buildConfig = parseBuildXml(xml)
  } catch (err) {
    return jsonResponse({ error: `Failed to parse XML: ${String(err)}` }, 400)
  }

  let result
  try {
    result = await pool.calculate(xml)
  } catch (err) {
    return jsonResponse({ error: `Calculation failed: ${String(err)}` }, 500)
  }

  if (result.error) {
    return jsonResponse({ error: `Calculation failed: ${result.error}` }, 500)
  }

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

  if (result.error) {
    return jsonResponse({ error: `Recalculation failed: ${result.error}` }, 500)
  }

  return jsonResponse({ result }, 200)
}

async function handleI18n(): Promise<Response> {
  const map = await loadTranslations()
  return jsonResponse(Object.fromEntries(map), 200)
}

async function handleTreeAsset(req: RouteRequest): Promise<Response> {
  const filename = req.params.filename
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return new Response("Not Found", { status: 404 })
  }
  const filePath = join(TREE_ASSETS_DIR, filename)
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 })
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const contentTypeMap: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif",
  }
  const contentType = contentTypeMap[ext] ?? "application/octet-stream"
  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  })
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

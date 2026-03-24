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
const PORT = parseInt(process.env["PORT"] ?? "3000", 10)
const VITE_PORT = parseInt(process.env["VITE_PORT"] ?? "5173", 10)
const POOL_SIZE = parseInt(process.env["POOL_SIZE"] ?? "4", 10)

// 启动 Vite 子进程（内部端口，不对外暴露）
const viteProc = Bun.spawn(
  ["bun", "node_modules/.bin/vite", "--port", String(VITE_PORT)],
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

async function waitForVite(): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const socket = await Bun.connect({
      hostname: "127.0.0.1",
      port: VITE_PORT,
      socket: { open() {}, close() {}, error() {}, data() {} },
    }).catch(() => null)
    if (socket) {
      socket.end()
      return
    }
    await Bun.sleep(200)
  }
  throw new Error(`Vite failed to start on port ${VITE_PORT} within 30s`)
}

async function proxyToVite(req: Request): Promise<Response> {
  const url = new URL(req.url)
  url.protocol = "http:"
  url.host = `127.0.0.1:${VITE_PORT}`

  const headers = new Headers(req.headers)
  headers.set("host", `127.0.0.1:${VITE_PORT}`)

  try {
    const init: RequestInit = { method: req.method, headers }
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = req.body
    }
    return await fetch(url.toString(), init)
  } catch {
    return new Response("Frontend server unavailable", { status: 502 })
  }
}

console.log("[Server] Starting Vite and warming up LuaJIT pool...")
Promise.all([waitForVite(), pool.warmup()]).then(() => {
  console.log(`[Server] Ready — http://localhost:${PORT}`)

  Bun.serve({
    port: PORT,
    routes: {
      "/api/fixtures": { GET: handleListFixtures },
      "/api/fixtures/:name": { GET: (req) => handleGetFixture(req as RouteRequest) },
      "/api/calculate": { POST: handleCalculate },
      "/api/recalculate": { POST: handleRecalculate },
      "/api/tree-data": { GET: async () => jsonResponse(await getTreeDataCached(), 200) },
      "/api/i18n": { GET: handleI18n },
    },
    async fetch(req, server) {
      // WebSocket（Vite HMR）
      if (req.headers.get("upgrade") === "websocket") {
        const viteWsUrl = req.url
          .replace(`localhost:${PORT}`, `127.0.0.1:${VITE_PORT}`)
          .replace(/^http/, "ws")
        const viteWs = new WebSocket(viteWsUrl)
        const ok = server.upgrade(req, { data: { viteWs } })
        if (!ok) viteWs.close()
        return
      }

      return proxyToVite(req)
    },
    websocket: {
      open(ws) {
        const viteWs: WebSocket = (ws.data as { viteWs: WebSocket }).viteWs
        viteWs.onmessage = (e) =>
          ws.readyState === 1 && ws.send(e.data)
        viteWs.onclose = () => ws.close()
        viteWs.onerror = () => ws.close()
      },
      message(ws, msg) {
        const viteWs: WebSocket = (ws.data as { viteWs: WebSocket }).viteWs
        if (viteWs.readyState === WebSocket.OPEN) viteWs.send(msg)
      },
      close(ws) {
        const viteWs: WebSocket = (ws.data as { viteWs: WebSocket }).viteWs
        if (viteWs.readyState === WebSocket.OPEN) viteWs.close()
      },
    },
  })
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

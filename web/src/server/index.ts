import { WorkerPool } from "./worker-pool"
import { SessionStore } from "./session-store"
import { decodeBuildString } from "./decode"
import { parseBuildXml } from "./xml-parser"
import { randomUUID } from "crypto"

const PORT = 3001
const POOL_SIZE = parseInt(process.env["POOL_SIZE"] ?? "4", 10)

const pool = new WorkerPool(POOL_SIZE)
const sessions = new SessionStore()

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...")
  pool.shutdown()
  sessions.destroy()
  process.exit(0)
})

// 预热进程池，然后启动 HTTP 服务
console.log("[Server] Warming up LuaJIT worker pool...")
pool.warmup().then(() => {
  console.log(`[Server] Listening on http://localhost:${PORT}`)

  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url)

      // CORS headers（供 Vite 开发代理使用）
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders })
      }

      if (req.method === "POST" && url.pathname === "/api/calculate") {
        return handleCalculate(req, corsHeaders)
      }

      if (req.method === "POST" && url.pathname === "/api/recalculate") {
        return handleRecalculate(req, corsHeaders)
      }

      return new Response("Not Found", { status: 404 })
    },
  })
}).catch((err) => {
  console.error("[Server] Failed to start:", err)
  process.exit(1)
})

async function handleCalculate(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { buildCode?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders)
  }

  if (!body.buildCode || typeof body.buildCode !== "string") {
    return jsonResponse({ error: "Missing buildCode" }, 400, corsHeaders)
  }

  // 1. 解码 build string → XML
  let xml: string
  try {
    xml = decodeBuildString(body.buildCode)
  } catch (err) {
    return jsonResponse(
      { error: `Failed to decode build string: ${String(err)}` },
      400,
      corsHeaders
    )
  }

  // 2. 解析 XML → BuildConfig
  let buildConfig
  try {
    buildConfig = parseBuildXml(xml)
  } catch (err) {
    return jsonResponse(
      { error: `Failed to parse XML: ${String(err)}` },
      400,
      corsHeaders
    )
  }

  // 3. 发送到 LuaJIT 计算
  let result
  try {
    result = await pool.calculate(xml)
  } catch (err) {
    return jsonResponse(
      { error: `Calculation failed: ${String(err)}` },
      500,
      corsHeaders
    )
  }

  // 4. 存储会话（供 recalculate 使用）
  const sessionId = randomUUID()
  sessions.set(sessionId, xml)

  return jsonResponse({ sessionId, buildConfig, result }, 200, corsHeaders)
}

async function handleRecalculate(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { sessionId?: string; patch?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders)
  }

  if (!body.sessionId) {
    return jsonResponse({ error: "Missing sessionId" }, 400, corsHeaders)
  }

  const xml = sessions.get(body.sessionId)
  if (!xml) {
    return jsonResponse({ error: "Session not found or expired" }, 404, corsHeaders)
  }

  // TODO: Phase 2 实现 patch 应用逻辑
  // 目前直接用原始 XML 重新计算
  let result
  try {
    result = await pool.calculate(xml)
  } catch (err) {
    return jsonResponse(
      { error: `Recalculation failed: ${String(err)}` },
      500,
      corsHeaders
    )
  }

  return jsonResponse({ result }, 200, corsHeaders)
}

function jsonResponse(
  data: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  })
}

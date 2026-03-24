# POB Web Analyzer — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 web/ 项目骨架，实现服务端 LuaJIT 进程池 + `/api/calculate` 端点，前端展示 Build 字符串输入、Stats 面板和 Warnings 面板。

**Architecture:** Bun HTTP 服务端通过长度前缀协议与持久 LuaJIT 子进程通信，LuaJIT 运行 POB 计算引擎返回 JSON stats。前端 React + Shadcn 展示计算结果，左侧 StatsPanel 常驻，右侧 Tab 区域为后续功能预留框架。

**Tech Stack:** Bun, Vite, React 18, TypeScript, Shadcn/ui, Tailwind CSS v4, LuaJIT

---

## 文件结构

```
web/
├── lua/
│   └── server_calc.lua        # LuaJIT 入口：读 XML → POB 计算 → 输出 JSON
├── src/
│   ├── client/
│   │   ├── types.ts           # 共享类型：BuildConfig, CalcResult, DisplayStat
│   │   ├── App.tsx            # 根组件：整体布局（Header + 左栏 + 右 Tab）
│   │   ├── main.tsx           # 入口
│   │   ├── components/
│   │   │   ├── BuildInput.tsx    # build string 输入框 + Recalculate 按钮
│   │   │   ├── StatsPanel.tsx    # 左侧常驻 stats 列表（分组折叠）
│   │   │   ├── WarningsPanel.tsx # 左侧 warnings 列表
│   │   │   └── TabsArea.tsx      # 右侧 Tab 容器（Phase 1 只有占位 Tab）
│   │   └── hooks/
│   │       └── useCalculate.ts   # 封装 /api/calculate 请求逻辑
│   └── server/
│       ├── index.ts           # Bun HTTP 服务入口，路由 /api/calculate
│       ├── decode.ts          # base64url decode + zlib inflate → XML string
│       ├── worker-pool.ts     # LuaJIT 进程池（借出/归还/重建）
│       ├── lua-bridge.ts      # 单进程通信：写 XML → 读 JSON（长度前缀协议）
│       ├── xml-parser.ts      # XML string → BuildConfig（解析 Build/Skills/Tree/Items/Config 节点）
│       └── session-store.ts   # sessionId → 原始 XML 的 TTL 内存存储（30 分钟）
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Task 1：项目脚手架

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/src/client/main.tsx`
- Create: `web/src/client/App.tsx`
- Create: `web/src/client/types.ts`

- [ ] **Step 1: 初始化 Bun 项目**

在 `web/` 目录下运行：

```bash
cd web
bun init -y
bun add react react-dom
bun add -D typescript @types/react @types/react-dom vite @vitejs/plugin-react
```

- [ ] **Step 2: 安装 Shadcn/ui 和 Tailwind**

```bash
bun add tailwindcss @tailwindcss/vite
bunx shadcn@latest init
# 选择: New York style, zinc base color, CSS variables: yes
bunx shadcn@latest add button card badge separator tabs collapsible
```

- [ ] **Step 3: 创建 `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/client/*"] }
  },
  "include": ["src/client"]
}
```

- [ ] **Step 4: 创建 `web/vite.config.ts`**

```typescript
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src/client") } },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
})
```

- [ ] **Step 5: 创建 `web/src/client/types.ts`**

```typescript
export interface DisplayStat {
  stat: string
  label: string
  value: string
  warn: boolean
  category: string
}

export interface CalcResult {
  stats: Record<string, number>
  warnings: string[]
  displayStats: DisplayStat[]
}

export interface SocketGroup {
  enabled: boolean
  label: string
  slot: string
  mainActiveSkill: number
  gems: GemInstance[]
}

export interface GemInstance {
  skillId: string
  gemId: string
  nameSpec: string
  level: number
  quality: number
  qualityId: string
  enabled: boolean
}

export interface Item {
  id: number
  rawText: string
  name: string
  base: string
  rarity: string
}

export interface BuildConfig {
  level: number
  className: string
  ascendClassName: string
  skills: SocketGroup[]
  tree: {
    treeVersion: string
    classId: number
    ascendClassId: number
    allocNodes: number[]
  }
  items: {
    itemList: Item[]
    slots: Record<string, number>
  }
  config: Record<string, unknown>
}

export interface CalculateResponse {
  sessionId: string
  buildConfig: BuildConfig
  result: CalcResult
}
```

- [ ] **Step 6: 创建占位 `web/src/client/App.tsx`**

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <p className="p-4">POB Web Analyzer — Phase 1</p>
    </div>
  )
}
```

- [ ] **Step 7: 创建 `web/src/client/main.tsx`**

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 8: 验证前端能启动**

```bash
cd web && bun run dev
```

期望：浏览器打开 `http://localhost:5173` 看到 "POB Web Analyzer — Phase 1"

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "feat(web): initialize project scaffold with Bun + Vite + React + Shadcn"
```

---

## Task 2：LuaJIT 计算脚本

**Files:**
- Create: `web/lua/server_calc.lua`

依赖：POB 的 `src/HeadlessWrapper.lua` 和 `runtime/lua/dkjson.lua`（通过 LUA_PATH 注入）

- [ ] **Step 1: 从 BuildDisplayStats.lua 提取全量 stat key**

从 `src/Modules/BuildDisplayStats.lua` 中提取所有 `stat = "..."` 值，作为白名单：

```bash
grep -o 'stat = "[^"]*"' src/Modules/BuildDisplayStats.lua | \
  sed 's/stat = "//;s/"//' | sort -u
```

- [ ] **Step 2: 创建 `web/lua/server_calc.lua`**

```lua
-- web/lua/server_calc.lua
-- 启动前提：
--   cwd = PathOfBuilding/src/
--   LUA_PATH = ../runtime/lua/?.lua;../runtime/lua/?/init.lua
--   CI 环境变量不能为 "true"（否则 ModCache 不加载导致计算错误）

local json = require "dkjson"

-- 一次性加载 POB 引擎（约 1-3 秒）
dofile("HeadlessWrapper.lua")

-- stat key 白名单（只序列化数值字段，避免函数引用等无法 JSON 化的值）
local EXPORT_STATS = {
  -- Offence
  "CombinedDPS", "FullDPS", "TotalDPS", "TotalDot", "FullDotDPS",
  "AverageHit", "AverageDamage", "AverageBurstDamage", "CombinedAvg",
  "SkillDPS", "BleedDPS", "IgniteDPS", "PoisonDPS", "DecayDPS",
  "ImpaleDPS", "WithBleedDPS", "WithIgniteDPS", "WithPoisonDPS", "WithImpaleDPS",
  "TotalDotDPS", "WithDotDPS", "WithIgniteAverageDamage",
  "CritChance", "PreEffectiveCritChance", "CritMultiplier",
  "Speed", "HitChance", "HitSpeed",
  "ProjectileCount", "ChainMaxString", "PierceCountString", "ForkCountString", "BounceCount",
  -- Defence
  "Life", "LifeUnreserved", "LifeUnreservedPercent", "LifeRecoverable",
  "EnergyShield", "EnergyShieldRecoveryCap",
  "Mana", "ManaUnreserved", "ManaUnreservedPercent",
  "Ward", "Armour", "Evasion",
  "TotalEHP",
  "FireResist", "FireResistOverCap", "FireMaximumHitTaken",
  "ColdResist", "ColdResistOverCap", "ColdMaximumHitTaken",
  "LightningResist", "LightningResistOverCap", "LightningMaximumHitTaken",
  "ChaosResist", "ChaosResistOverCap", "ChaosMaximumHitTaken",
  "PhysicalDamageReduction", "PhysicalMaximumHitTaken",
  "AttackDodgeChance", "SpellDodgeChance", "MeleeEvadeChance", "ProjectileEvadeChance",
  "EffectiveBlockChance", "EffectiveSpellBlockChance", "EffectiveSpellSuppressionChance",
  "EffectiveMovementSpeedMod",
  -- Regen/Leech
  "LifeRegenRecovery", "LifeLeechGainRate", "LifeLeechGainPerHit",
  "ManaRegenRecovery", "ManaLeechGainRate", "ManaLeechGainPerHit",
  "EnergyShieldRegenRecovery", "EnergyShieldLeechGainRate", "EnergyShieldLeechGainPerHit",
  "NetLifeRegen", "NetManaRegen", "NetEnergyShieldRegen", "TotalNetRegen", "TotalBuildDegen",
  -- Costs
  "ManaCost", "LifeCost", "ESCost", "RageCost", "SoulCost",
  "ManaPerSecondCost", "LifePerSecondCost", "ESPerSecondCost", "RagePerSecondCost",
  -- Attributes
  "Str", "Dex", "Int", "Omni",
  "ReqStr", "ReqDex", "ReqInt", "ReqOmni",
  -- Misc
  "ActiveMinionLimit", "Devotion", "LootQuantity", "LootRarity",
  "Cooldown", "Duration", "DurationSecondary",
  "AuraDuration", "AuraEffectMod", "CurseEffectMod",
  "Rage", "Spec:LifeInc", "Spec:EnergyShieldInc", "Spec:ManaInc",
  "Spec:ArmourInc", "Spec:EvasionInc",
}

-- 长度前缀协议循环：读 XML → 计算 → 输出 JSON
while true do
  local lenLine = io.read("*l")
  if not lenLine then break end
  local len = tonumber(lenLine)
  if not len then break end

  local xml = io.read(len)
  if not xml then break end

  local ok, err = pcall(function()
    loadBuildFromXML(xml, "server_request")
  end)

  if not ok then
    io.write(json.encode({ error = tostring(err) }) .. "\n")
    io.flush()
  else
    local output = build.calcsTab.mainOutput
    local stats = {}
    for _, key in ipairs(EXPORT_STATS) do
      local v = output[key]
      if type(v) == "number" then
        stats[key] = v
      end
    end

    local warnings = {}
    for _, msg in ipairs(build.controls.warnings.lines) do
      table.insert(warnings, msg)
    end

    io.write(json.encode({ stats = stats, warnings = warnings }) .. "\n")
    io.flush()
  end
end
```

- [ ] **Step 3: 手动验证脚本可运行**

必须在 `src/` 目录下执行（HeadlessWrapper 要求 cwd 为 src/）：

```bash
cd src && LUA_PATH="../runtime/lua/?.lua;../runtime/lua/?/init.lua" \
  luajit ../web/lua/server_calc.lua
# 期望：引擎加载完成后进程停在等待 stdin 输入（无报错）
# Ctrl+C 退出
```

若 luajit 未安装：`brew install luajit` (macOS) 或 `apt install luajit` (Linux)

- [ ] **Step 4: Commit**

```bash
git add web/lua/server_calc.lua
git commit -m "feat(web): add LuaJIT server_calc.lua with length-prefix protocol"
```

---

## Task 3：服务端 decode + lua-bridge + worker-pool

**Files:**
- Create: `web/src/server/decode.ts`
- Create: `web/src/server/lua-bridge.ts`
- Create: `web/src/server/worker-pool.ts`
- Create: `web/src/server/session-store.ts`

- [ ] **Step 1: 安装 zlib 依赖**

```bash
cd web && bun add pako
bun add -D @types/node
```

- [ ] **Step 2: 创建 `web/src/server/decode.ts`**

POB build string 格式：base64url（`-` 代替 `+`，`_` 代替 `/`）→ zlib deflate → XML

```typescript
import { inflate } from "pako"

export function decodeBuildCode(buildCode: string): string {
  // 还原标准 base64
  const base64 = buildCode.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const xml = inflate(bytes, { to: "string" })
  return xml
}
```

- [ ] **Step 3: 创建 `web/src/server/lua-bridge.ts`**

单进程通信封装：发送 XML，接收 JSON 响应。使用长度前缀协议。

```typescript
import type { Subprocess } from "bun"
import type { CalcResult } from "../client/types"

export interface LuaWorker {
  process: Subprocess
  busy: boolean
}

const NEWLINE = new TextEncoder().encode("\n")

export async function sendToLua(
  worker: LuaWorker,
  xml: string
): Promise<CalcResult> {
  const xmlBytes = new TextEncoder().encode(xml)
  const lenLine = new TextEncoder().encode(String(xmlBytes.length))

  // 写入长度行 + XML 内容
  const writer = worker.process.stdin!.getWriter()
  await writer.write(lenLine)
  await writer.write(NEWLINE)
  await writer.write(xmlBytes)
  writer.releaseLock()

  // 读取一行 JSON 响应
  const reader = worker.process.stdout!.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) throw new Error("LuaJIT process closed unexpectedly")
    chunks.push(value)
    // 检查是否包含换行符（JSON 响应以 \n 结尾）
    const combined = mergeChunks(chunks)
    const text = new TextDecoder().decode(combined)
    const newlineIdx = text.indexOf("\n")
    if (newlineIdx !== -1) {
      reader.releaseLock()
      const line = text.slice(0, newlineIdx)
      const parsed = JSON.parse(line)
      if (parsed.error) throw new Error(`LuaJIT error: ${parsed.error}`)
      return buildCalcResult(parsed)
    }
  }
}

function mergeChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function buildCalcResult(raw: {
  stats: Record<string, number>
  warnings: string[]
}): CalcResult {
  return {
    stats: raw.stats,
    warnings: raw.warnings,
    displayStats: [], // Phase 1 占位，Phase 2 扩展
  }
}
```

- [ ] **Step 4: 创建 `web/src/server/worker-pool.ts`**

```typescript
import path from "path"
import { fileURLToPath } from "url"
import type { LuaWorker } from "./lua-bridge"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../..")

const POOL_SIZE = parseInt(process.env.LUA_POOL_SIZE ?? "4", 10)
const workers: LuaWorker[] = []
const queue: Array<(worker: LuaWorker) => void> = []

export async function initPool(): Promise<void> {
  for (let i = 0; i < POOL_SIZE; i++) {
    workers.push(await spawnWorker())
  }
  console.log(`[pool] ${POOL_SIZE} LuaJIT workers ready`)
}

export function acquireWorker(): Promise<LuaWorker> {
  const idle = workers.find((w) => !w.busy)
  if (idle) {
    idle.busy = true
    return Promise.resolve(idle)
  }
  return new Promise((resolve) => queue.push(resolve))
}

export function releaseWorker(worker: LuaWorker): void {
  worker.busy = false
  const next = queue.shift()
  if (next) {
    worker.busy = true
    next(worker)
  }
}

async function spawnWorker(): Promise<LuaWorker> {
  const proc = Bun.spawn(
    ["luajit", path.join(REPO_ROOT, "web/lua/server_calc.lua")],
    {
      cwd: path.join(REPO_ROOT, "src"),
      env: {
        ...process.env,
        LUA_PATH: "../runtime/lua/?.lua;../runtime/lua/?/init.lua",
        CI: undefined, // 防止 CI 环境变量导致 ModCache 不加载
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }
  )

  // 等待引擎初始化完成（进程准备好读 stdin 之前不接受请求）
  // HeadlessWrapper 的初始化是同步的，spawn 后进程进入循环，直接可用
  await new Promise((resolve) => setTimeout(resolve, 50))

  proc.exited.then(() => {
    console.warn("[pool] A LuaJIT worker exited, respawning...")
    const idx = workers.findIndex((w) => w.process === proc)
    if (idx !== -1) {
      spawnWorker().then((newWorker) => {
        workers[idx] = newWorker
      })
    }
  })

  return { process: proc, busy: false }
}
```

- [ ] **Step 5: 创建 `web/src/server/session-store.ts`**

```typescript
import { randomUUID } from "crypto"

interface Session {
  xml: string
  expiresAt: number
}

const store = new Map<string, Session>()
const TTL_MS = 30 * 60 * 1000 // 30 分钟

export function createSession(xml: string): string {
  const id = randomUUID()
  store.set(id, { xml, expiresAt: Date.now() + TTL_MS })
  return id
}

export function getSessionXml(id: string): string | null {
  const session = store.get(id)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    store.delete(id)
    return null
  }
  return session.xml
}

// 定期清理过期 session
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of store) {
    if (now > session.expiresAt) store.delete(id)
  }
}, 5 * 60 * 1000)
```

- [ ] **Step 6: Commit**

```bash
git add web/src/server/
git commit -m "feat(web): add decode, lua-bridge, worker-pool, session-store"
```

---

## Task 4：XML 解析器（BuildConfig 提取）

**Files:**
- Create: `web/src/server/xml-parser.ts`

从 POB XML 中提取前端展示和编辑所需的 BuildConfig 字段。

- [ ] **Step 1: 安装 XML 解析库**

```bash
cd web && bun add fast-xml-parser
```

- [ ] **Step 2: 创建 `web/src/server/xml-parser.ts`**

```typescript
import { XMLParser } from "fast-xml-parser"
import type { BuildConfig, Item, SocketGroup, GemInstance } from "../client/types"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["Skill", "Gem", "Item", "ItemSet", "Slot", "Spec", "MasteryEffect", "Socket"].includes(name),
})

export function parseXmlToBuildConfig(xml: string): BuildConfig {
  const doc = parser.parse(xml)
  const root = doc.PathOfBuilding

  const buildNode = root.Build
  const skillsNode = root.Skills
  const treeNode = root.Tree
  const itemsNode = root.Items
  const configNode = root.Config

  return {
    level: parseInt(buildNode["@_level"] ?? "1", 10),
    className: buildNode["@_className"] ?? "",
    ascendClassName: buildNode["@_ascendClassName"] ?? "",
    skills: parseSkills(skillsNode),
    tree: parseTree(treeNode),
    items: parseItems(itemsNode),
    config: parseConfig(configNode),
  }
}

function parseSkills(node: any): SocketGroup[] {
  if (!node) return []
  const skillSets = node.SkillSet ?? [node]
  const skills: any[] = []
  for (const set of skillSets) {
    const skillList = set.Skill ?? []
    for (const skill of skillList) {
      skills.push(skill)
    }
  }
  return skills.map((s: any): SocketGroup => ({
    enabled: s["@_enabled"] === "true",
    label: s["@_label"] ?? "",
    slot: s["@_slot"] ?? "",
    mainActiveSkill: parseInt(s["@_mainActiveSkill"] ?? "1", 10),
    gems: (s.Gem ?? []).map((g: any): GemInstance => ({
      skillId: g["@_skillId"] ?? "",
      gemId: g["@_gemId"] ?? "",
      nameSpec: g["@_nameSpec"] ?? g["@_skillId"] ?? "",
      level: parseInt(g["@_level"] ?? "20", 10),
      quality: parseInt(g["@_quality"] ?? "0", 10),
      qualityId: g["@_qualityId"] ?? "Default",
      enabled: g["@_enabled"] !== "false",
    })),
  }))
}

function parseTree(node: any): BuildConfig["tree"] {
  const spec = node?.Spec?.[0] ?? node?.Spec ?? {}
  const nodesStr: string = spec["@_nodes"] ?? ""
  const allocNodes = nodesStr
    .split(",")
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => !isNaN(n))

  return {
    treeVersion: spec["@_treeVersion"] ?? "",
    classId: parseInt(spec["@_classId"] ?? "0", 10),
    ascendClassId: parseInt(spec["@_ascendClassId"] ?? "0", 10),
    allocNodes,
  }
}

function parseItems(node: any): BuildConfig["items"] {
  if (!node) return { itemList: [], slots: {} }

  const itemList: Item[] = (node.Item ?? []).map((item: any): Item => {
    const raw: string = typeof item === "string" ? item : item["#text"] ?? ""
    const lines = raw.trim().split("\n")
    const nameLine = lines[1]?.trim() ?? ""
    const baseLine = lines[2]?.trim() ?? ""
    const rarityLine = lines[0]?.replace("Rarity: ", "").trim() ?? "NORMAL"

    return {
      id: parseInt(item["@_id"] ?? "0", 10),
      rawText: raw.trim(),
      name: nameLine,
      base: baseLine,
      rarity: rarityLine,
    }
  })

  const slots: Record<string, number> = {}
  const itemSet = (node.ItemSet ?? [])[0] ?? node.ItemSet ?? {}
  for (const slot of itemSet.Slot ?? []) {
    slots[slot["@_name"]] = parseInt(slot["@_itemId"] ?? "0", 10)
  }

  return { itemList, slots }
}

function parseConfig(node: any): Record<string, unknown> {
  if (!node) return {}
  const result: Record<string, unknown> = {}
  const inputs = node.Input ?? []
  for (const input of inputs) {
    const name: string = input["@_name"] ?? ""
    const val = input["@_number"] ?? input["@_boolean"] ?? input["@_string"]
    if (name && val !== undefined) result[name] = val
  }
  return result
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/server/xml-parser.ts
git commit -m "feat(web): add XML → BuildConfig parser"
```

---

## Task 5：服务端 HTTP 入口 + `/api/calculate`

**Files:**
- Create: `web/src/server/index.ts`
- Modify: `web/package.json`（添加 server 启动脚本）

- [ ] **Step 1: 创建 `web/src/server/index.ts`**

```typescript
import { initPool, acquireWorker, releaseWorker } from "./worker-pool"
import { sendToLua } from "./lua-bridge"
import { decodeBuildCode } from "./decode"
import { parseXmlToBuildConfig } from "./xml-parser"
import { createSession } from "./session-store"

const PORT = parseInt(process.env.PORT ?? "3001", 10)

await initPool()

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() })
    }

    if (req.method === "POST" && url.pathname === "/api/calculate") {
      return handleCalculate(req)
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`[server] listening on http://localhost:${PORT}`)

async function handleCalculate(req: Request): Promise<Response> {
  let body: { buildCode?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse("Invalid JSON", 400)
  }

  if (!body.buildCode) {
    return errorResponse("Missing buildCode", 400)
  }

  let xml: string
  try {
    xml = decodeBuildCode(body.buildCode)
  } catch (e) {
    return errorResponse(`Failed to decode build code: ${e}`, 400)
  }

  let buildConfig
  try {
    buildConfig = parseXmlToBuildConfig(xml)
  } catch (e) {
    return errorResponse(`Failed to parse XML: ${e}`, 400)
  }

  const worker = await acquireWorker()
  let result
  try {
    result = await sendToLua(worker, xml)
  } catch (e) {
    return errorResponse(`Calculation failed: ${e}`, 500)
  } finally {
    releaseWorker(worker)
  }

  const sessionId = createSession(xml)

  return jsonResponse({ sessionId, buildConfig, result })
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}
```

- [ ] **Step 2: 在 `web/package.json` 添加启动脚本**

```json
{
  "scripts": {
    "dev": "vite",
    "dev:server": "bun run src/server/index.ts",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 3: 启动服务端，手动用 curl 测试**

在一个终端启动服务端：
```bash
cd web && bun run dev:server
```

期望输出：`[pool] 4 LuaJIT workers ready` + `[server] listening on http://localhost:3001`

用真实 POB build string 测试（可从 POB 应用导出）：
```bash
curl -X POST http://localhost:3001/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"buildCode":"<粘贴真实的 POB build string>"}'
```

期望响应：包含 `sessionId`、`buildConfig`、`result.stats`、`result.warnings` 的 JSON

- [ ] **Step 4: Commit**

```bash
git add web/src/server/index.ts web/package.json
git commit -m "feat(web): add Bun HTTP server with /api/calculate endpoint"
```

---

## Task 6：前端 useCalculate Hook + BuildInput 组件

**Files:**
- Create: `web/src/client/hooks/useCalculate.ts`
- Create: `web/src/client/components/BuildInput.tsx`

- [ ] **Step 1: 创建 `web/src/client/hooks/useCalculate.ts`**

```typescript
import { useState } from "react"
import type { CalculateResponse } from "../types"

interface CalculateState {
  loading: boolean
  error: string | null
  data: CalculateResponse | null
}

export function useCalculate() {
  const [state, setState] = useState<CalculateState>({
    loading: false,
    error: null,
    data: null,
  })

  async function calculate(buildCode: string) {
    setState({ loading: true, error: null, data: null })
    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildCode: buildCode.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Request failed")
      }
      const data: CalculateResponse = await res.json()
      setState({ loading: false, error: null, data })
    } catch (e) {
      setState({ loading: false, error: String(e), data: null })
    }
  }

  return { ...state, calculate }
}
```

- [ ] **Step 2: 创建 `web/src/client/components/BuildInput.tsx`**

```tsx
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  onCalculate: (buildCode: string) => void
  loading: boolean
}

export function BuildInput({ onCalculate, loading }: Props) {
  const [value, setValue] = useState("")

  return (
    <div className="flex gap-2 p-4 border-b">
      <Textarea
        className="flex-1 h-10 min-h-10 resize-none font-mono text-sm"
        placeholder="粘贴 POB Build String..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
      />
      <Button
        onClick={() => onCalculate(value)}
        disabled={loading || !value.trim()}
      >
        {loading ? "计算中..." : "计算"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: 安装缺少的 Shadcn 组件**

```bash
cd web && bunx shadcn@latest add textarea
```

- [ ] **Step 4: Commit**

```bash
git add web/src/client/hooks/ web/src/client/components/BuildInput.tsx
git commit -m "feat(web): add useCalculate hook and BuildInput component"
```

---

## Task 7：StatsPanel + WarningsPanel 组件

**Files:**
- Create: `web/src/client/components/StatsPanel.tsx`
- Create: `web/src/client/components/WarningsPanel.tsx`

- [ ] **Step 1: 创建 `web/src/client/components/StatsPanel.tsx`**

```tsx
import { useState } from "react"
import type { CalcResult } from "../types"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight } from "lucide-react"

// 核心 stat 分组展示配置
const STAT_GROUPS = [
  {
    label: "伤害",
    stats: [
      { key: "FullDPS", label: "Full DPS", fmt: "int" },
      { key: "CombinedDPS", label: "Combined DPS", fmt: "int" },
      { key: "TotalDPS", label: "Hit DPS", fmt: "int" },
      { key: "TotalDot", label: "DoT DPS", fmt: "int" },
      { key: "AverageHit", label: "Avg Hit", fmt: "int" },
      { key: "CritChance", label: "暴击率", fmt: "pct" },
      { key: "CritMultiplier", label: "暴击倍率", fmt: "pct" },
    ],
  },
  {
    label: "防御",
    stats: [
      { key: "Life", label: "生命", fmt: "int" },
      { key: "EnergyShield", label: "能量护盾", fmt: "int" },
      { key: "Mana", label: "法力", fmt: "int" },
      { key: "TotalEHP", label: "有效HP", fmt: "int" },
      { key: "Armour", label: "护甲", fmt: "int" },
      { key: "Evasion", label: "闪避", fmt: "int" },
      { key: "FireResist", label: "火抗", fmt: "pct" },
      { key: "ColdResist", label: "冰抗", fmt: "pct" },
      { key: "LightningResist", label: "雷抗", fmt: "pct" },
      { key: "ChaosResist", label: "混沌抗", fmt: "pct" },
    ],
  },
  {
    label: "费用",
    stats: [
      { key: "ManaCost", label: "法力消耗", fmt: "int" },
      { key: "LifeCost", label: "生命消耗", fmt: "int" },
      { key: "ManaUnreserved", label: "可用法力", fmt: "int" },
      { key: "LifeUnreserved", label: "可用生命", fmt: "int" },
    ],
  },
]

function formatStat(value: number, fmt: string): string {
  if (fmt === "pct") return `${value.toFixed(1)}%`
  if (fmt === "int") return Math.round(value).toLocaleString()
  return value.toFixed(2)
}

interface StatRowProps {
  label: string
  value: number
  fmt: string
  warn?: boolean
}

function StatRow({ label, value, fmt, warn }: StatRowProps) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${warn ? "text-yellow-500" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{formatStat(value, fmt)}</span>
    </div>
  )
}

interface StatGroupProps {
  label: string
  stats: typeof STAT_GROUPS[0]["stats"]
  data: Record<string, number>
  warnings: string[]
}

function StatGroup({ label, stats, data, warnings }: StatGroupProps) {
  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {stats.map(({ key, label, fmt }) =>
          data[key] !== undefined ? (
            <StatRow key={key} label={label} value={data[key]} fmt={fmt} />
          ) : null
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface Props {
  result: CalcResult
}

export function StatsPanel({ result }: Props) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide mb-1">
        统计数据
      </div>
      {STAT_GROUPS.map((group) => (
        <StatGroup
          key={group.label}
          label={group.label}
          stats={group.stats}
          data={result.stats}
          warnings={result.warnings}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 安装缺少的 Shadcn 组件和 lucide**

```bash
cd web
bunx shadcn@latest add collapsible
bun add lucide-react
```

- [ ] **Step 3: 创建 `web/src/client/components/WarningsPanel.tsx`**

```tsx
import type { CalcResult } from "../types"
import { AlertTriangle } from "lucide-react"

interface Props {
  result: CalcResult
}

export function WarningsPanel({ result }: Props) {
  if (result.warnings.length === 0) return null

  return (
    <div className="p-3 border-t">
      <div className="text-xs font-semibold uppercase tracking-wide text-yellow-500 mb-2">
        警告
      </div>
      <ul className="flex flex-col gap-1">
        {result.warnings.map((msg, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-yellow-500">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{msg}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/client/components/StatsPanel.tsx web/src/client/components/WarningsPanel.tsx
git commit -m "feat(web): add StatsPanel and WarningsPanel components"
```

---

## Task 8：整合 App.tsx，完成 Phase 1

**Files:**
- Modify: `web/src/client/App.tsx`
- Create: `web/src/client/components/TabsArea.tsx`

- [ ] **Step 1: 创建 `web/src/client/components/TabsArea.tsx`（Phase 1 占位）**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BuildConfig, CalcResult } from "../types"

interface Props {
  buildConfig: BuildConfig | null
  result: CalcResult | null
}

export function TabsArea({ buildConfig, result }: Props) {
  return (
    <Tabs defaultValue="stats" className="flex-1">
      <TabsList className="w-full justify-start border-b rounded-none h-9 px-4">
        <TabsTrigger value="stats">统计</TabsTrigger>
        <TabsTrigger value="items" disabled={!buildConfig}>装备</TabsTrigger>
        <TabsTrigger value="skills" disabled={!buildConfig}>技能</TabsTrigger>
        <TabsTrigger value="tree" disabled={!buildConfig}>天赋树</TabsTrigger>
        <TabsTrigger value="config" disabled={!buildConfig}>配置</TabsTrigger>
      </TabsList>
      <TabsContent value="stats" className="p-4">
        {result ? (
          <div className="text-sm text-muted-foreground">
            已计算 {Object.keys(result.stats).length} 个数值
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            请输入 Build String 并点击计算
          </div>
        )}
      </TabsContent>
      <TabsContent value="items"><div className="p-4 text-sm text-muted-foreground">装备（Phase 2）</div></TabsContent>
      <TabsContent value="skills"><div className="p-4 text-sm text-muted-foreground">技能（Phase 3）</div></TabsContent>
      <TabsContent value="tree"><div className="p-4 text-sm text-muted-foreground">天赋树（Phase 4）</div></TabsContent>
      <TabsContent value="config"><div className="p-4 text-sm text-muted-foreground">配置（Phase 3）</div></TabsContent>
    </Tabs>
  )
}
```

- [ ] **Step 2: 更新 `web/src/client/App.tsx`**

```tsx
import { BuildInput } from "./components/BuildInput"
import { StatsPanel } from "./components/StatsPanel"
import { WarningsPanel } from "./components/WarningsPanel"
import { TabsArea } from "./components/TabsArea"
import { useCalculate } from "./hooks/useCalculate"

export default function App() {
  const { loading, error, data, calculate } = useCalculate()

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b">
        <BuildInput onCalculate={calculate} loading={loading} />
        {error && (
          <div className="px-4 pb-2 text-sm text-destructive">{error}</div>
        )}
      </header>

      {/* 主体：左栏 + 右内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：Stats + Warnings */}
        <aside className="w-64 border-r overflow-y-auto shrink-0">
          {data?.result ? (
            <>
              <StatsPanel result={data.result} />
              <WarningsPanel result={data.result} />
            </>
          ) : (
            <div className="p-4 text-xs text-muted-foreground">
              {loading ? "计算中..." : "等待 Build 数据"}
            </div>
          )}
        </aside>

        {/* 右侧：Tab 内容区 */}
        <main className="flex-1 overflow-y-auto">
          <TabsArea
            buildConfig={data?.buildConfig ?? null}
            result={data?.result ?? null}
          />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 同时启动前后端，端到端测试**

终端 1（服务端）：
```bash
cd web && bun run dev:server
```

终端 2（前端）：
```bash
cd web && bun run dev
```

打开 `http://localhost:5173`，粘贴真实 POB Build String，点击"计算"。

期望：左侧 StatsPanel 显示 DPS、Life、抗性等数值；若有警告则 WarningsPanel 显示。

- [ ] **Step 4: Final commit**

```bash
git add web/src/client/
git commit -m "feat(web): complete Phase 1 — full stats + warnings display"
```

---

## Phase 1 完成标准

- [ ] `bun run dev:server` 启动后 LuaJIT 进程池就绪
- [ ] `POST /api/calculate` 接受真实 POB build string，返回 stats JSON
- [ ] 前端展示 StatsPanel（伤害/防御/费用分组）
- [ ] 前端展示 WarningsPanel（有警告时）
- [ ] Tab 区域 Items/Skills/Tree/Config 有占位，等待 Phase 2-5

---

> 下一步：执行 Plan Phase 2-5（可并行）：`docs/superpowers/plans/2026-03-23-pob-web-phase2-5.md`

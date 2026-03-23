# POB Web Analyzer 设计文档

**日期**：2026-03-23
**状态**：已确认

---

## 概述

基于 Path of Building（POB）现有 Lua 计算引擎，构建一个 Web 界面，允许用户粘贴 POB build string 后查看完整的构建分析结果，并支持在线修改装备、被动树、技能石、配置选项后重新计算。

---

## 目标

- 接受 POB base64 build string，展示完整计算结果
- 复用 POB 原有 Lua 计算引擎（不重新实现计算逻辑）
- 支持全配置修改：装备替换、被动树节点分配、技能石配置、ConfigTab 选项
- 异常/警告检测展示（如法力不足、被动点超限等）
- 中文界面（使用 PoeCharm2 翻译数据）

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | Bun + Vite + React + Shadcn/ui |
| 后端 | Bun HTTP Server |
| 计算引擎 | LuaJIT 进程池（复用 POB src/ 原始代码） |
| i18n | PoeCharm2 CSV（英文 → 中文映射） |

---

## 整体架构

```
浏览器（React）
  │
  │ HTTP POST /api/calculate
  │ HTTP POST /api/recalculate
  ▼
Bun HTTP Server（web/src/server/）
  ├── base64url decode + zlib inflate → XML
  ├── XML 解析/序列化（TypeScript）
  └── LuaJIT 进程池（WorkerPool）
        │ stdin: XML text
        │ stdout: JSON
        ▼
      LuaJIT 进程（cwd: src/）
        ├── dofile("HeadlessWrapper.lua")  ← 桩掉 GUI
        ├── loadBuildFromXML(xml)
        ├── runCallback("OnFrame")
        └── 输出 mainOutput stats + warnings → JSON stdout
```

---

## 目录结构

```
PathOfBuilding/
├── src/                        ← POB 原始代码（只读，不修改）
└── web/                        ← 新增
    ├── lua/
    │   └── server_calc.lua     ← LuaJIT 入口脚本（依赖 ../src/）
    ├── src/
    │   ├── client/             ← React 前端
    │   │   ├── components/
    │   │   │   ├── BuildInput.tsx
    │   │   │   ├── StatsPanel.tsx
    │   │   │   ├── WarningsPanel.tsx
    │   │   │   ├── ItemsTab.tsx
    │   │   │   ├── SkillsTab.tsx
    │   │   │   ├── PassiveTreeTab.tsx
    │   │   │   └── ConfigTab.tsx
    │   │   ├── hooks/
    │   │   │   └── useI18n.ts
    │   │   └── main.tsx
    │   └── server/             ← Bun HTTP Server
    │       ├── index.ts
    │       ├── worker-pool.ts  ← LuaJIT 进程池
    │       ├── lua-bridge.ts   ← stdin/stdout 通信
    │       └── xml-parser.ts   ← XML ↔ BuildConfig 转换
    ├── i18n/
    │   └── loader.ts           ← 加载 PoeCharm2 CSV
    ├── package.json
    └── vite.config.ts
```

---

## LuaJIT 进程池

- Bun 服务启动时预热 N 个 LuaJIT 进程（N 可配置，默认 4）
- 每个进程 cwd 设为 `src/`，加载完整 POB 引擎（约 1-3s 冷启动，只需一次）
- 请求到来时从池中借出空闲进程，通过 stdin 发送 XML，读取 stdout JSON
- 进程计算完成后归还池中（进程持久存活，不重启）
- 进程崩溃时自动重建并重新加载引擎

### LuaJIT 脚本模式

XML 传输使用**长度前缀协议**：Bun 先发送 `<字节数>\n`，再发送 XML 内容，避免换行符歧义。

`mainOutput` 包含函数引用等不可序列化字段，需明确枚举要导出的数值字段。

`loadBuildFromXML` 内部已通过 `runCallback("OnFrame")` 完整执行了 `BuildOutput()` + `RefreshStatList()`，调用后可直接读取 `mainOutput` 和 `warnings.lines`，**不需要**再额外调用 `BuildOutput()`。

**进程启动时必须通过 `LUA_PATH` 环境变量注入 runtime 路径**（参考 `.busted` 的 `lpath` 配置），否则 `require "dkjson"` 等依赖会找不到模块。同时**不能设置 `CI=true` 环境变量**，否则 POB 会跳过 ModCache 加载导致计算错误。

```lua
-- web/lua/server_calc.lua
-- 启动时设置（worker-pool.ts spawn 时通过 env 注入）：
--   LUA_PATH=../runtime/lua/?.lua;../runtime/lua/?/init.lua
--   不得设置 CI=true

local json = require "dkjson"   -- 位于 runtime/lua/dkjson.lua

-- 启动时加载 POB 引擎（一次性，约 1-3s）
dofile("HeadlessWrapper.lua")

-- 需要导出的 stat key 白名单（数值类型）
-- 完整列表在实现时根据 BuildDisplayStats.lua 的 displayStats 补充
local EXPORT_STATS = {
  "CombinedDPS", "FullDPS", "TotalDPS", "TotalDot",
  "Life", "LifeUnreserved", "EnergyShield", "Mana", "ManaUnreserved",
  "TotalEHP", "Evasion", "Armour", "Ward",
  "FireResist", "ColdResist", "LightningResist", "ChaosResist",
}

-- 循环：每次读取长度前缀 + XML，计算，输出 JSON
while true do
  local lenLine = io.read("*l")
  if not lenLine then break end
  local len = tonumber(lenLine)
  local xml = io.read(len)

  -- loadBuildFromXML 内部已完整执行 BuildOutput + RefreshStatList
  loadBuildFromXML(xml, "request")

  local output = build.calcsTab.mainOutput
  local stats = {}
  for _, key in ipairs(EXPORT_STATS) do
    if type(output[key]) == "number" then
      stats[key] = output[key]
    end
  end

  local warnings = {}
  for _, msg in ipairs(build.controls.warnings.lines) do  -- ipairs，非 pairs
    table.insert(warnings, msg)
  end

  io.write(json.encode({ stats = stats, warnings = warnings }) .. "\n")
  io.flush()
end
```

### worker-pool.ts 进程启动要求

```typescript
// worker-pool.ts 中 spawn LuaJIT 进程时
const luaProcess = Bun.spawn(["luajit", "../web/lua/server_calc.lua"], {
  cwd: path.join(repoRoot, "src"),
  env: {
    ...process.env,
    LUA_PATH: "../runtime/lua/?.lua;../runtime/lua/?/init.lua",
    CI: undefined,  // 明确清除，防止宿主环境传入
  },
  stdin: "pipe",
  stdout: "pipe",
})
```

---

## API 设计

### POST /api/calculate

初次提交 build string。

**请求**：
```json
{ "buildCode": "<base64url string>" }
```

**响应**：
```json
{
  "sessionId": "<session 标识，供 recalculate 使用>",
  "buildConfig": { ... },
  "result": { "stats": { ... }, "warnings": [...], "displayStats": [...] }
}
```

### POST /api/recalculate

用户修改配置后手动触发。服务端持有原始 XML，前端只需传入变更的部分；服务端将变更 patch 到原始 XML 后再传给 LuaJIT，避免 BuildConfig → XML 转换时丢失不在 BuildConfig 中的字段（notes、party 配置等）。

**请求**：
```json
{
  "sessionId": "<服务端返回的 session 标识>",
  "patch": {
    "items": { ... },       // 可选，有变更才传
    "tree": { ... },        // 可选
    "skills": [ ... ],      // 可选
    "config": { ... }       // 可选
  }
}
```

**响应**：
```json
{
  "result": { "stats": { ... }, "warnings": [...], "displayStats": [...] }
}
```

服务端在 `/api/calculate` 响应时生成 `sessionId`，并在内存中保留该 session 的原始 XML（TTL 30 分钟）。`/api/recalculate` 时取出原始 XML，用 patch 中的变更替换对应 XML 节点，再送给 LuaJIT。

---

## 数据结构

```typescript
interface BuildConfig {
  level: number
  className: string
  ascendClassName: string
  skills: SocketGroup[]
  tree: {
    treeVersion: string
    classId: number
    ascendClassId: number
    allocNodes: number[]    // 已分配节点 ID 列表
  }
  items: {
    itemList: Item[]        // 所有装备定义
    slots: Record<string, number>  // 槽名 → itemId
  }
  config: Record<string, unknown>
}

interface Item {
  id: number
  rawText: string          // 原始游戏文本
  name: string
  base: string
  rarity: string
  modLines: ModLine[]      // 解析后的词缀行
}

interface CalcResult {
  stats: Record<string, number>
  warnings: string[]
  displayStats: DisplayStat[]
}

interface DisplayStat {
  category: string
  label: string
  value: string            // 格式化后的字符串
  warn: boolean
}
```

---

## UI 布局

```
┌─────────────────────────────────────────────────────┐
│  Header：Build String 输入框 + [Recalculate] 按钮   │
├──────────────┬──────────────────────────────────────┤
│  StatsPanel  │  Tab: [Stats][Items][Skills][Tree][Config] │
│  ─────────── │                                      │
│  Warnings    │  （主内容区按 Tab 切换）              │
│  Panel       │                                      │
└──────────────┴──────────────────────────────────────┘
```

### 各 Tab 功能

**ItemsTab**
- 14 个装备槽网格展示
- 每槽：装备名 + 所有词缀（名称 + 数值）
- 点击装备槽 → 侧边面板，粘贴新装备文本替换
- 替换后本地更新状态，等待用户点 Recalculate

**SkillsTab**
- 技能石组列表
- 每颗宝石：名称 + 等级 + 品质 + 启用开关
- 支持修改等级/品质、增删宝石

**PassiveTreeTab**
- Canvas 全屏渲染（参考 timeless-jewels 实现）
- 节点用几何图形表示（圆形，大小区分 normal/notable/keystone）
- 已分配节点高亮
- 平移（鼠标拖拽）+ 缩放（滚轮）
- 点击节点切换分配状态
- 不使用任何游戏图片资源

**ConfigTab**
- 根据配置项动态渲染表单（checkbox / 数字 / 下拉）
- 分组折叠

**StatsPanel（左侧常驻）**
- 核心指标：DPS、EHP、Life、ES、Mana 等
- 分组折叠：Offence / Defence / Costs
- 有警告的数值标黄/红

---

## i18n 策略

- 数据源：[PoeCharm2 CSV 翻译文件](https://github.com/Chuanhsing/PoeCharm2/tree/main/Data/Translate/zh-rCN)（72 个 CSV，格式：`English,中文`）
- 服务端启动时加载全部 CSV，构建 `Map<string, string>`（英文 → 中文）
- API 响应中所有 label/stat 名称保持英文原文作为 key
- 前端通过 `useI18n` hook 查翻译 Map 显示中文
- `{0}` `{1}` 占位符在前端渲染时替换
- `^xRRGGBB` 颜色代码在前端渲染时转为 CSS 颜色

---

## 关键依赖与约束

1. **LuaJIT 必须已安装**：服务器需要 `luajit` 命令可用
2. **POB src/ 目录完整**：`web/` 与 `src/` 在同一仓库中
3. **XML 传输协议**：使用长度前缀（`<字节数>\n<XML内容>`），Lua 侧用 `io.read(len)` 读取，避免 XML 内换行符歧义
4. **进程池内存**：每个 LuaJIT 进程约占 50-150MB（含 ModCache），需根据服务器内存配置池大小
5. **ModCache 会正常加载**：LuaJIT 进程启动时 POB 引擎会加载全部数据文件（包含 2.2MB ModCache）；这只发生在进程初始化时，后续请求复用已加载状态，无额外开销
6. **禁止 `CI=true` 环境变量**：该变量会使 POB 跳过 ModCache 加载，导致所有 mod 相关计算结果错误；worker-pool.ts spawn 进程时必须显式清除此变量
7. **`LUA_PATH` 必须注入**：spawn 时设置 `LUA_PATH=../runtime/lua/?.lua;../runtime/lua/?/init.lua`，否则 `dkjson`、`xml`、`base64` 等库无法被 require 到

---

## 分阶段实现计划

### Phase 1：核心计算 + Stats 展示
- Bun 服务端 + LuaJIT 进程池
- `/api/calculate` 端点
- StatsPanel + WarningsPanel
- BuildInput（粘贴 build string）

### Phase 2：装备展示与替换
- ItemsTab（展示词缀）
- 装备替换（粘贴文本）
- `/api/recalculate` 端点

### Phase 3：技能石 + 配置
- SkillsTab（宝石配置）
- ConfigTab（配置选项）

### Phase 4：被动树
- PassiveTreeTab（Canvas 渲染）
- 节点点击切换分配

### Phase 5：i18n
- PoeCharm2 CSV 加载
- 全界面中文化


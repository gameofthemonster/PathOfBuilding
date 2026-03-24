# POB Web Analyzer — Phase 2-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 基础上，并行实现装备展示/替换（Phase 2）、技能石+配置（Phase 3）、被动树 Canvas（Phase 4）、i18n（Phase 5）四个功能模块。

**Architecture:** Phase 2-5 各模块之间无依赖，均依赖 Phase 1 完成的服务端基础设施（worker-pool、session-store、/api/calculate）。Phase 2-3 还需要 `/api/recalculate` 端点（Task R1），该端点实现完成后 Phase 2-5 可完全并行。

**Tech Stack:** Bun, React 18, TypeScript, Shadcn/ui, Tailwind CSS, Canvas API, fast-xml-parser

---

## 执行顺序

```
[Task R1: /api/recalculate 端点]  ← 先完成这个（约 30 分钟）
        │
   ┌────┴───────────────┬──────────────────┬──────────────────┐
   ▼                    ▼                  ▼                  ▼
[Phase 2: 装备]    [Phase 3: 技能+配置]  [Phase 4: 被动树]  [Phase 5: i18n]
(Task 2a-2c)       (Task 3a-3b)          (Task 4a-4c)       (Task 5a-5b)
```

Phase 2-5 可由独立 Agent 并行执行。

---

## Task R1：`/api/recalculate` 端点（前置）

**Files:**
- Modify: `web/src/server/index.ts`（添加 recalculate 路由）
- Create: `web/src/server/xml-patcher.ts`（XML patch 应用）

依赖：Phase 1 完成后执行。

- [ ] **Step 1: 创建 `web/src/server/xml-patcher.ts`**

将前端的 patch（items/tree/skills/config 变更）应用到原始 XML，返回新 XML 字符串。使用字符串操作修改对应 XML 节点，保留其他所有字段。

```typescript
import { XMLParser, XMLBuilder } from "fast-xml-parser"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["Skill", "Gem", "Item", "ItemSet", "Slot", "Spec", "Input"].includes(name),
})

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
})

export interface BuildPatch {
  items?: {
    itemList?: Array<{ id: number; rawText: string }>
    slots?: Record<string, number>
  }
  tree?: {
    allocNodes?: number[]
    classId?: number
    ascendClassId?: number
  }
  skills?: Array<{
    index: number
    gems?: Array<{ index: number; level?: number; quality?: number; enabled?: boolean }>
  }>
  config?: Record<string, unknown>
}

export function applyPatch(originalXml: string, patch: BuildPatch): string {
  const doc = parser.parse(originalXml)
  const root = doc.PathOfBuilding

  if (patch.items) {
    const itemsNode = root.Items
    if (patch.items.itemList && itemsNode?.Item) {
      for (const itemPatch of patch.items.itemList) {
        const item = itemsNode.Item.find(
          (i: any) => parseInt(i["@_id"], 10) === itemPatch.id
        )
        if (item) {
          item["#text"] = "\n" + itemPatch.rawText + "\n"
        }
      }
    }
    if (patch.items.slots && itemsNode?.ItemSet) {
      const itemSet = itemsNode.ItemSet[0] ?? itemsNode.ItemSet
      if (itemSet?.Slot) {
        for (const slot of itemSet.Slot) {
          const slotName = slot["@_name"]
          if (patch.items.slots[slotName] !== undefined) {
            slot["@_itemId"] = String(patch.items.slots[slotName])
          }
        }
      }
    }
  }

  if (patch.tree) {
    const spec = root.Tree?.Spec?.[0] ?? root.Tree?.Spec
    if (spec) {
      if (patch.tree.allocNodes) {
        spec["@_nodes"] = patch.tree.allocNodes.join(",")
      }
      if (patch.tree.classId !== undefined) {
        spec["@_classId"] = String(patch.tree.classId)
      }
      if (patch.tree.ascendClassId !== undefined) {
        spec["@_ascendClassId"] = String(patch.tree.ascendClassId)
      }
    }
  }

  if (patch.skills) {
    const allSkills = collectSkills(root.Skills)
    for (const skillPatch of patch.skills) {
      const skill = allSkills[skillPatch.index]
      if (!skill || !skillPatch.gems) continue
      for (const gemPatch of skillPatch.gems) {
        const gem = skill.Gem?.[gemPatch.index]
        if (!gem) continue
        if (gemPatch.level !== undefined) gem["@_level"] = String(gemPatch.level)
        if (gemPatch.quality !== undefined) gem["@_quality"] = String(gemPatch.quality)
        if (gemPatch.enabled !== undefined) gem["@_enabled"] = String(gemPatch.enabled)
      }
    }
  }

  if (patch.config && root.Config) {
    for (const [name, value] of Object.entries(patch.config)) {
      const input = (root.Config.Input ?? []).find(
        (i: any) => i["@_name"] === name
      )
      if (input) {
        if (typeof value === "boolean") input["@_boolean"] = String(value)
        else if (typeof value === "number") input["@_number"] = String(value)
        else input["@_string"] = String(value)
      }
    }
  }

  return builder.build(doc)
}

function collectSkills(skillsNode: any): any[] {
  if (!skillsNode) return []
  const sets = skillsNode.SkillSet ?? [skillsNode]
  return sets.flatMap((s: any) => s.Skill ?? [])
}
```

- [ ] **Step 2: 在 `web/src/server/index.ts` 添加 `/api/recalculate` 路由**

在 `fetch` 函数中添加：

```typescript
if (req.method === "POST" && url.pathname === "/api/recalculate") {
  return handleRecalculate(req)
}
```

添加处理函数：

```typescript
import { applyPatch, type BuildPatch } from "./xml-patcher"
import { getSessionXml } from "./session-store"

async function handleRecalculate(req: Request): Promise<Response> {
  let body: { sessionId?: string; patch?: BuildPatch }
  try {
    body = await req.json()
  } catch {
    return errorResponse("Invalid JSON", 400)
  }

  if (!body.sessionId) return errorResponse("Missing sessionId", 400)

  const originalXml = getSessionXml(body.sessionId)
  if (!originalXml) return errorResponse("Session not found or expired", 404)

  const patchedXml = body.patch
    ? applyPatch(originalXml, body.patch)
    : originalXml

  const worker = await acquireWorker()
  let result
  try {
    result = await sendToLua(worker, patchedXml)
  } catch (e) {
    return errorResponse(`Calculation failed: ${e}`, 500)
  } finally {
    releaseWorker(worker)
  }

  return jsonResponse({ result })
}
```

- [ ] **Step 3: 测试 `/api/recalculate`**

先调用 `/api/calculate` 获取 sessionId，再调用 `/api/recalculate`：

```bash
SESSION_ID=$(curl -s -X POST http://localhost:3001/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"buildCode":"<build string>"}' | bun -e "const d=await Bun.stdin.json(); console.log(d.sessionId)")

curl -X POST http://localhost:3001/api/recalculate \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"patch\":{}}"
```

期望：返回相同的 stats（空 patch 不改变任何值）

- [ ] **Step 4: Commit**

```bash
git add web/src/server/xml-patcher.ts web/src/server/index.ts
git commit -m "feat(web): add /api/recalculate endpoint with XML patch support"
```

---

## Phase 2：装备展示与替换（可并行）

**Files:**
- Create: `web/src/client/components/ItemsTab.tsx`
- Create: `web/src/client/components/ItemSlot.tsx`
- Create: `web/src/client/hooks/useRecalculate.ts`

### Task 2a：`useRecalculate` hook

- [ ] **Step 1: 创建 `web/src/client/hooks/useRecalculate.ts`**

```typescript
import { useState } from "react"
import type { CalcResult, BuildConfig } from "../types"
import type { BuildPatch } from "../../server/xml-patcher"

interface RecalcState {
  loading: boolean
  error: string | null
}

export function useRecalculate(
  sessionId: string | null,
  onResult: (result: CalcResult) => void
) {
  const [state, setState] = useState<RecalcState>({ loading: false, error: null })

  async function recalculate(patch: BuildPatch) {
    if (!sessionId) return
    setState({ loading: true, error: null })
    try {
      const res = await fetch("/api/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, patch }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Recalculate failed")
      }
      const data = await res.json()
      onResult(data.result)
      setState({ loading: false, error: null })
    } catch (e) {
      setState({ loading: false, error: String(e) })
    }
  }

  return { ...state, recalculate }
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/client/hooks/useRecalculate.ts
git commit -m "feat(web): add useRecalculate hook"
```

### Task 2b：ItemSlot 组件

装备槽单元，展示装备名称和词缀列表，可点击替换。

- [ ] **Step 1: 创建 `web/src/client/components/ItemSlot.tsx`**

```tsx
import { useState } from "react"
import type { Item } from "../types"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"

const RARITY_COLORS: Record<string, string> = {
  UNIQUE: "text-orange-400",
  RARE: "text-yellow-400",
  MAGIC: "text-blue-400",
  NORMAL: "text-gray-200",
}

interface Props {
  slotName: string
  item: Item | null
  onReplace: (rawText: string) => void
}

export function ItemSlot({ slotName, item, onReplace }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  function handleReplace() {
    if (draft.trim()) {
      onReplace(draft.trim())
      setOpen(false)
      setDraft("")
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{slotName}</span>
              {item && (
                <Badge variant="outline" className="text-xs">
                  {item.rarity}
                </Badge>
              )}
            </div>
            {item ? (
              <div className={`text-sm font-medium ${RARITY_COLORS[item.rarity] ?? ""}`}>
                {item.name || item.base}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">空</div>
            )}
          </CardHeader>
          {item && (
            <CardContent className="py-1 px-3">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-4 max-h-20 overflow-hidden">
                {item.rawText
                  .split("\n")
                  .slice(3)
                  .filter((l) => l.trim() && !l.startsWith("---"))
                  .slice(0, 6)
                  .join("\n")}
              </pre>
            </CardContent>
          )}
        </Card>
      </SheetTrigger>
      <SheetContent side="right" className="w-96">
        <SheetHeader>
          <SheetTitle>替换 {slotName}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 mt-4">
          {item && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">当前装备</div>
              <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-y-auto">
                {item.rawText}
              </pre>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              粘贴新装备文本（游戏内 Ctrl+C 复制）
            </div>
            <Textarea
              className="font-mono text-xs h-48"
              placeholder="Rarity: UNIQUE&#10;Item Name&#10;Base Type&#10;..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button onClick={handleReplace} disabled={!draft.trim()}>
            替换装备
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: 安装 Sheet 组件**

```bash
cd web && bunx shadcn@latest add sheet
```

- [ ] **Step 3: Commit**

```bash
git add web/src/client/components/ItemSlot.tsx
git commit -m "feat(web): add ItemSlot component with replace sheet"
```

### Task 2c：ItemsTab 组件

- [ ] **Step 1: 创建 `web/src/client/components/ItemsTab.tsx`**

```tsx
import { useState } from "react"
import type { BuildConfig, Item } from "../types"
import { ItemSlot } from "./ItemSlot"

const SLOT_ORDER = [
  "Weapon 1", "Weapon 2",
  "Helmet", "Body Armour", "Gloves", "Boots",
  "Amulet", "Ring 1", "Ring 2", "Belt",
  "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5",
]

interface Props {
  buildConfig: BuildConfig
  onItemChange: (slotName: string, newItemText: string) => void
}

export function ItemsTab({ buildConfig, onItemChange }: Props) {
  const { itemList, slots } = buildConfig.items

  function getItem(slotName: string): Item | null {
    const itemId = slots[slotName]
    if (!itemId) return null
    return itemList.find((i) => i.id === itemId) ?? null
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        {SLOT_ORDER.map((slotName) => (
          <ItemSlot
            key={slotName}
            slotName={slotName}
            item={getItem(slotName)}
            onReplace={(rawText) => onItemChange(slotName, rawText)}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        替换装备后点击页面顶部"重新计算"按钮生效
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 将 ItemsTab 集成进 TabsArea.tsx**

修改 `web/src/client/components/TabsArea.tsx`，在 items TabsContent 中渲染 ItemsTab：

```tsx
// 在 TabsArea Props 中添加：
onItemChange: (slotName: string, newItemText: string) => void

// TabsContent value="items" 改为：
<TabsContent value="items">
  {buildConfig ? (
    <ItemsTab buildConfig={buildConfig} onItemChange={onItemChange} />
  ) : null}
</TabsContent>
```

- [ ] **Step 3: 在 App.tsx 中接线装备替换逻辑**

```tsx
// 在 App.tsx 的 useCalculate 之后添加：
const [currentBuildConfig, setCurrentBuildConfig] = useState<BuildConfig | null>(null)
const [sessionId, setSessionId] = useState<string | null>(null)
const [currentResult, setCurrentResult] = useState<CalcResult | null>(null)
const [pendingPatch, setPendingPatch] = useState<BuildPatch>({})

// 当 calculate 成功时：
useEffect(() => {
  if (data) {
    setCurrentBuildConfig(data.buildConfig)
    setSessionId(data.sessionId)
    setCurrentResult(data.result)
    setPendingPatch({})
  }
}, [data])

function handleItemChange(slotName: string, newItemText: string) {
  // 更新本地 buildConfig 展示
  setCurrentBuildConfig(prev => {
    if (!prev) return prev
    const newItemId = Math.max(...prev.items.itemList.map(i => i.id)) + 1
    // 解析新装备名称（取第二行）
    const lines = newItemText.trim().split("\n")
    const newItem: Item = {
      id: newItemId,
      rawText: newItemText,
      name: lines[1]?.trim() ?? "",
      base: lines[2]?.trim() ?? "",
      rarity: lines[0]?.replace("Rarity: ", "").trim() ?? "NORMAL",
    }
    return {
      ...prev,
      items: {
        itemList: [...prev.items.itemList, newItem],
        slots: { ...prev.items.slots, [slotName]: newItemId },
      },
    }
  })
  // 累积 patch
  setPendingPatch(prev => ({
    ...prev,
    items: {
      ...prev.items,
      itemList: [
        ...(prev.items?.itemList ?? []),
        { id: /* newItemId */ 0, rawText: newItemText }
      ],
    }
  }))
}
```

> 注意：App.tsx 状态管理较复杂，实现时参考上述逻辑，重点是保持 pendingPatch 与 currentBuildConfig 同步。实际 newItemId 需在 handleItemChange 外计算后传入 patch。

- [ ] **Step 4: Commit**

```bash
git add web/src/client/components/ItemsTab.tsx web/src/client/components/TabsArea.tsx web/src/client/App.tsx
git commit -m "feat(web): complete Phase 2 — items display and replace"
```

---

## Phase 3：技能石 + 配置（可并行，依赖 Task R1）

**Files:**
- Create: `web/src/client/components/SkillsTab.tsx`
- Create: `web/src/client/components/ConfigTab.tsx`

### Task 3a：SkillsTab

- [ ] **Step 1: 创建 `web/src/client/components/SkillsTab.tsx`**

```tsx
import { useState } from "react"
import type { BuildConfig, SocketGroup, GemInstance } from "../types"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface GemRowProps {
  gem: GemInstance
  onChange: (updated: Partial<GemInstance>) => void
}

function GemRow({ gem, onChange }: GemRowProps) {
  const GEM_COLOR = gem.skillId.startsWith("Support") ? "bg-blue-900" : "bg-red-900"
  return (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-0">
      <Switch
        checked={gem.enabled}
        onCheckedChange={(enabled) => onChange({ enabled })}
        className="h-4 w-7"
      />
      <span className={`text-xs px-1 rounded ${GEM_COLOR}`}>
        {gem.nameSpec || gem.skillId}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <Label className="text-xs text-muted-foreground">Lv</Label>
        <Input
          type="number"
          min={1}
          max={23}
          value={gem.level}
          onChange={(e) => onChange({ level: parseInt(e.target.value, 10) })}
          className="w-12 h-6 text-xs text-center px-1"
        />
        <Label className="text-xs text-muted-foreground">Q</Label>
        <Input
          type="number"
          min={0}
          max={23}
          value={gem.quality}
          onChange={(e) => onChange({ quality: parseInt(e.target.value, 10) })}
          className="w-12 h-6 text-xs text-center px-1"
        />
      </div>
    </div>
  )
}

interface Props {
  buildConfig: BuildConfig
  onSkillChange: (groupIndex: number, gemIndex: number, updated: Partial<GemInstance>) => void
}

export function SkillsTab({ buildConfig, onSkillChange }: Props) {
  return (
    <div className="p-4 flex flex-col gap-3">
      {buildConfig.skills.map((group, gi) => (
        <Card key={gi}>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {group.label || group.slot || `组 ${gi + 1}`}
              </span>
              {group.slot && (
                <Badge variant="outline" className="text-xs">{group.slot}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="py-1 px-3">
            {group.gems.map((gem, ji) => (
              <GemRow
                key={ji}
                gem={gem}
                onChange={(updated) => onSkillChange(gi, ji, updated)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 安装 Switch + Input 组件**

```bash
cd web && bunx shadcn@latest add switch input label
```

- [ ] **Step 3: 集成进 TabsArea.tsx**

在 TabsContent value="skills" 中渲染 SkillsTab，传入 onSkillChange 回调。

- [ ] **Step 4: Commit**

```bash
git add web/src/client/components/SkillsTab.tsx
git commit -m "feat(web): add SkillsTab with gem level/quality editing"
```

### Task 3b：ConfigTab

从 POB 的 `ConfigOptions.lua` 中配置项结构动态渲染表单。

- [ ] **Step 1: 提取 ConfigOptions 类别和控件类型**

```bash
grep -o 'type = "[^"]*"' src/Modules/ConfigOptions.lua | sort | uniq -c | sort -rn | head -20
```

- [ ] **Step 2: 创建 `web/src/client/components/ConfigTab.tsx`**

```tsx
import type { BuildConfig } from "../types"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// 重要的配置项（从 ConfigOptions.lua 中选取常用项）
const CONFIG_DISPLAY: Array<{
  key: string
  label: string
  type: "boolean" | "number" | "select"
  options?: string[]
}> = [
  { key: "enemyIsBoss", label: "目标为 Boss", type: "boolean" },
  { key: "enemyIsUnique", label: "目标为稀有", type: "boolean" },
  { key: "conditionFullLife", label: "满生命值", type: "boolean" },
  { key: "conditionFullEnergyShield", label: "满 ES", type: "boolean" },
  { key: "conditionEnergyShieldFull", label: "ES 满", type: "boolean" },
  { key: "conditionLowLife", label: "低生命值", type: "boolean" },
  { key: "conditionLowMana", label: "低法力", type: "boolean" },
  { key: "conditionMoving", label: "移动中", type: "boolean" },
  { key: "conditionOnFlask", label: "喝瓶中", type: "boolean" },
  { key: "buffFrenzyCharges", label: "狂热充能", type: "number" },
  { key: "buffPowerCharges", label: "能量充能", type: "number" },
  { key: "buffEnduranceCharges", label: "耐力充能", type: "number" },
  { key: "buffRage", label: "暴怒值", type: "number" },
]

interface Props {
  buildConfig: BuildConfig
  onConfigChange: (key: string, value: unknown) => void
}

export function ConfigTab({ buildConfig, onConfigChange }: Props) {
  const config = buildConfig.config

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="text-xs text-muted-foreground mb-2">
        常用配置选项（仅展示部分，完整选项需查看 POB）
      </div>
      {CONFIG_DISPLAY.map(({ key, label, type, options }) => {
        const value = config[key]
        return (
          <div key={key} className="flex items-center justify-between py-1 border-b last:border-0">
            <Label className="text-sm">{label}</Label>
            {type === "boolean" && (
              <Switch
                checked={value === "true" || value === true}
                onCheckedChange={(v) => onConfigChange(key, v)}
              />
            )}
            {type === "number" && (
              <Input
                type="number"
                min={0}
                value={String(value ?? 0)}
                onChange={(e) => onConfigChange(key, parseFloat(e.target.value))}
                className="w-20 h-7 text-xs text-center"
              />
            )}
            {type === "select" && options && (
              <Select
                value={String(value ?? "")}
                onValueChange={(v) => onConfigChange(key, v)}
              >
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: 安装 Select 组件**

```bash
cd web && bunx shadcn@latest add select
```

- [ ] **Step 4: 集成进 TabsArea.tsx**

在 TabsContent value="config" 中渲染 ConfigTab。

- [ ] **Step 5: Commit**

```bash
git add web/src/client/components/ConfigTab.tsx
git commit -m "feat(web): add ConfigTab with common build config options"
```

---

## Phase 4：被动树 Canvas（可并行，依赖 Phase 1）

**Files:**
- Create: `web/src/client/components/PassiveTreeTab.tsx`
- Create: `web/src/client/hooks/usePassiveTree.ts`
- Create: `web/src/client/lib/tree-data.ts`（从服务端加载树节点数据）
- Create: `web/src/server/tree-data-api.ts`（提供树节点数据的 API）

### Task 4a：树数据 API（服务端）

POB 的树节点数据在 `src/TreeData/<version>/tree.lua`，需要解析后提供给前端。

- [ ] **Step 1: 检查树数据格式**

```bash
ls src/TreeData/
# 找到当前版本目录
ls src/TreeData/$(ls src/TreeData/ | tail -1)/
```

- [ ] **Step 2: 扩展 `web/lua/server_calc.lua`，在引擎初始化后立即导出树数据**

树数据需要一个已初始化的 build（`build.spec.tree` 才存在）。策略：`server_calc.lua` 启动后使用任意测试 build XML 触发一次 `loadBuildFromXML`，然后把树数据写入一个临时文件，Bun 服务启动时读取该文件即可。无需修改主循环协议。

在 `server_calc.lua` 的 `dofile("HeadlessWrapper.lua")` 之后、主循环之前添加：

```lua
-- 导出树节点数据到文件（仅首次运行时）
local treeDataPath = "../web/tree-data.json"
local f = io.open(treeDataPath, "r")
if not f then
  -- 用一个最小 XML 触发引擎初始化（使 build.spec.tree 可用）
  local minXml = [[<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="1" className="Scion" ascendClassName="None"/>
  <Skills/><Tree activeSpec="1"><Spec treeVersion="3_21" classId="0" ascendClassId="0" nodes=""/></Tree>
  <Items/><Config/>
</PathOfBuilding>]]
  loadBuildFromXML(minXml, "tree_init")

  local nodes = {}
  local tree = build.spec.tree
  for id, node in pairs(tree.nodes) do
    if node.type ~= "class" then
      table.insert(nodes, {
        id = node.id,
        name = node.name,
        type = node.type,
        x = node.x,
        y = node.y,
        mods = node.mods or {},
        ascendancyName = node.ascendancyName,
      })
    end
  end

  local out = io.open(treeDataPath, "w")
  if out then
    out:write(json.encode(nodes))
    out:close()
  end
end
```

- [ ] **Step 3: 创建服务端 `/api/tree-data` 端点（读取 tree-data.json）**

在 `web/src/server/index.ts` 中添加：

```typescript
export interface TreeNodeData {
  id: number; name: string; type: string
  x: number; y: number; mods: string[]
  ascendancyName?: string
}

// 在模块顶层（initPool 之前）读取缓存文件
let treeDataCache: TreeNodeData[] | null = null

async function getTreeDataCached(): Promise<TreeNodeData[]> {
  if (treeDataCache) return treeDataCache
  const file = Bun.file(path.join(REPO_ROOT, "web/tree-data.json"))
  if (await file.exists()) {
    treeDataCache = await file.json()
    return treeDataCache!
  }
  return []
}

// 在 fetch 路由中添加：
if (req.method === "GET" && url.pathname === "/api/tree-data") {
  return jsonResponse(await getTreeDataCached())
}
```

> 注意：第一次启动服务端时，`server_calc.lua` 初始化会生成 `web/tree-data.json`（约 1-2 秒）。后续请求直接读取缓存文件，无额外开销。`web/tree-data.json` 可加入 `.gitignore`（体积较大）。

- [ ] **Step 4: Commit**

```bash
git add web/lua/server_calc.lua web/src/server/index.ts
git commit -m "feat(web): add /api/tree-data endpoint via tree-data.json cache"
```

### Task 4b：前端树数据加载 + Canvas 渲染

- [ ] **Step 1: 创建 `web/src/client/lib/tree-data.ts`**

```typescript
export interface TreeNode {
  id: number
  name: string
  type: "normal" | "keystone" | "notable" | "socket" | "mastery" | "ascendancy"
  x: number
  y: number
  mods: string[]
  ascendancyName?: string
}

let cachedNodes: TreeNode[] | null = null

export async function fetchTreeData(): Promise<TreeNode[]> {
  if (cachedNodes) return cachedNodes
  const res = await fetch("/api/tree-data")
  cachedNodes = await res.json()
  return cachedNodes!
}
```

- [ ] **Step 2: 创建 `web/src/client/hooks/usePassiveTree.ts`**

```typescript
import { useEffect, useRef, useState } from "react"
import { fetchTreeData, type TreeNode } from "../lib/tree-data"

export interface PassiveTreeState {
  nodes: TreeNode[]
  allocNodes: Set<number>
  scale: number
  offsetX: number
  offsetY: number
}

export function usePassiveTree(allocNodes: number[]) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [allocated, setAllocated] = useState<Set<number>>(new Set(allocNodes))
  const stateRef = useRef({ scale: 0.15, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    fetchTreeData().then(setNodes)
  }, [])

  useEffect(() => {
    setAllocated(new Set(allocNodes))
  }, [allocNodes])

  function toggleNode(nodeId: number) {
    setAllocated((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  return { nodes, allocated, stateRef, toggleNode }
}
```

- [ ] **Step 3: 创建 `web/src/client/components/PassiveTreeTab.tsx`**

```tsx
import { useRef, useEffect, useCallback } from "react"
import type { BuildConfig } from "../types"
import { usePassiveTree } from "../hooks/usePassiveTree"

const NODE_RADIUS: Record<string, number> = {
  keystone: 24,
  notable: 14,
  normal: 8,
  socket: 12,
  mastery: 16,
  ascendancy: 12,
}

const NODE_COLOR: Record<string, string> = {
  keystone: "#b8860b",
  notable: "#4a90d9",
  normal: "#888",
  socket: "#9c27b0",
  mastery: "#555",
  ascendancy: "#c0a060",
}

const ALLOCATED_COLOR = "#ffd700"

interface Props {
  buildConfig: BuildConfig
  onAllocChange: (allocNodes: number[]) => void
}

export function PassiveTreeTab({ buildConfig, onAllocChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  })
  const viewRef = useRef({ scale: 0.15, offsetX: 0, offsetY: 0 })

  const { nodes, allocated, toggleNode } = usePassiveTree(buildConfig.tree.allocNodes)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext("2d")!
    const { scale, offsetX, offsetY } = viewRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (const node of nodes) {
      if (node.ascendancyName) continue // 简化：Phase 4 不渲染升华节点
      const sx = node.x * scale + offsetX
      const sy = node.y * scale + offsetY
      if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue

      const r = (NODE_RADIUS[node.type] ?? 8) * scale
      const isAlloc = allocated.has(node.id)

      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(r, 2), 0, Math.PI * 2)
      ctx.fillStyle = isAlloc ? ALLOCATED_COLOR : (NODE_COLOR[node.type] ?? "#888")
      ctx.fill()
      if (isAlloc) {
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }, [nodes, allocated])

  useEffect(() => {
    draw()
  }, [draw])

  // 鼠标事件：平移
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return
    const dx = e.clientX - dragRef.current.lastX
    const dy = e.clientY - dragRef.current.lastY
    viewRef.current.offsetX += dx
    viewRef.current.offsetY += dy
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY
    draw()
  }
  function onMouseUp() {
    dragRef.current.dragging = false
  }

  // 滚轮：缩放
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    viewRef.current.scale *= factor
    draw()
  }

  // 点击节点
  function onClick(e: React.MouseEvent) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { scale, offsetX, offsetY } = viewRef.current

    for (const node of nodes) {
      if (node.ascendancyName) continue
      const sx = node.x * scale + offsetX
      const sy = node.y * scale + offsetY
      const r = (NODE_RADIUS[node.type] ?? 8) * scale
      const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2)
      if (dist <= Math.max(r, 6)) {
        toggleNode(node.id)
        // 通知父组件
        const newAlloc = new Set(allocated)
        if (newAlloc.has(node.id)) newAlloc.delete(node.id)
        else newAlloc.add(node.id)
        onAllocChange(Array.from(newAlloc))
        return
      }
    }
  }

  return (
    <div className="w-full h-full" style={{ height: "calc(100vh - 120px)" }}>
      <canvas
        ref={canvasRef}
        width={window.innerWidth - 280}
        height={window.innerHeight - 120}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onClick}
      />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
        已分配 {allocated.size} 节点 · 拖拽平移 · 滚轮缩放
      </div>
    </div>
  )
}
```

### Task 4c：集成 PassiveTreeTab

- [ ] **Step 1: 在 TabsArea.tsx 中渲染 PassiveTreeTab**

```tsx
<TabsContent value="tree" className="p-0">
  {buildConfig ? (
    <PassiveTreeTab
      buildConfig={buildConfig}
      onAllocChange={onAllocChange}
    />
  ) : null}
</TabsContent>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/client/components/PassiveTreeTab.tsx \
        web/src/client/hooks/usePassiveTree.ts \
        web/src/client/lib/tree-data.ts
git commit -m "feat(web): add Canvas-based passive tree viewer with pan/zoom/click"
```

---

## Phase 5：i18n（可并行，依赖 Phase 1）

**Files:**
- Create: `web/src/client/hooks/useI18n.ts`
- Create: `web/src/server/i18n-loader.ts`（服务端加载 PoeCharm2 CSV）
- Create: `web/scripts/download-i18n.ts`（下载 CSV 脚本）

### Task 5a：下载并解析 PoeCharm2 CSV

- [ ] **Step 1: 创建下载脚本 `web/scripts/download-i18n.ts`**

```typescript
// 下载 PoeCharm2 的中文翻译 CSV 到 web/i18n/zh-CN/
import { mkdir } from "fs/promises"

const BASE_URL =
  "https://raw.githubusercontent.com/Chuanhsing/PoeCharm2/main/Data/Translate/zh-rCN"

// 需要的 CSV 文件（从仓库目录列表中选取关键文件）
const CSV_FILES = [
  "StatDescriptions.csv",
  "passive_skill_stat_descriptions.csv",
  "skill_stat_descriptions.csv",
  "MapStatDescriptions.csv",
  "gem_stat_descriptions.csv",
]

await mkdir("i18n/zh-CN", { recursive: true })

for (const file of CSV_FILES) {
  const url = `${BASE_URL}/${file}`
  console.log(`Downloading ${file}...`)
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  Failed: ${res.status}`)
    continue
  }
  await Bun.write(`i18n/zh-CN/${file}`, await res.text())
  console.log(`  OK`)
}
```

- [ ] **Step 2: 运行下载脚本**

```bash
cd web && bun run scripts/download-i18n.ts
```

期望：`web/i18n/zh-CN/` 下出现若干 CSV 文件

- [ ] **Step 3: 创建 `web/src/server/i18n-loader.ts`**

```typescript
import { readdir, readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const I18N_DIR = path.join(__dirname, "../../i18n/zh-CN")

let translationMap: Map<string, string> | null = null

export async function loadTranslations(): Promise<Map<string, string>> {
  if (translationMap) return translationMap
  translationMap = new Map()

  let files: string[]
  try {
    files = await readdir(I18N_DIR)
  } catch {
    console.warn("[i18n] i18n/zh-CN/ not found, translations disabled")
    return translationMap
  }

  for (const file of files.filter((f) => f.endsWith(".csv"))) {
    const content = await readFile(path.join(I18N_DIR, file), "utf-8")
    const lines = content.split("\n")
    for (const line of lines) {
      // 格式：English text,中文翻译
      const commaIdx = line.indexOf(",")
      if (commaIdx === -1) continue
      const en = line.slice(0, commaIdx).trim()
      const zh = line.slice(commaIdx + 1).trim()
      if (en && zh) translationMap.set(en, zh)
    }
  }

  console.log(`[i18n] Loaded ${translationMap.size} translations`)
  return translationMap
}
```

- [ ] **Step 4: 在 `/api/calculate` 响应中附带 displayStats 的中文 label**

在 `index.ts` 中 `await loadTranslations()` 并在 CalcResult 中附加翻译后的 label。

- [ ] **Step 5: Commit**

```bash
git add web/scripts/download-i18n.ts web/src/server/i18n-loader.ts web/i18n/
git commit -m "feat(web): add i18n support with PoeCharm2 CSV translations"
```

### Task 5b：前端 useI18n hook

- [ ] **Step 1: 创建 `web/src/client/hooks/useI18n.ts`**

```typescript
import { useState, useEffect } from "react"

let i18nMap: Map<string, string> | null = null

async function loadI18nMap(): Promise<Map<string, string>> {
  if (i18nMap) return i18nMap
  try {
    const res = await fetch("/api/i18n")
    const data: Record<string, string> = await res.json()
    i18nMap = new Map(Object.entries(data))
  } catch {
    i18nMap = new Map()
  }
  return i18nMap
}

export function useI18n() {
  const [map, setMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadI18nMap().then(setMap)
  }, [])

  function t(key: string, ...args: (string | number)[]): string {
    let text = map.get(key) ?? key
    for (let i = 0; i < args.length; i++) {
      text = text.replace(`{${i}}`, String(args[i]))
    }
    // 去掉 POB 颜色代码 ^xRRGGBB
    text = text.replace(/\^x[0-9A-Fa-f]{6}/g, "")
    return text
  }

  return { t }
}
```

- [ ] **Step 2: 添加 `/api/i18n` 服务端端点**

在 `index.ts` 中：

```typescript
if (req.method === "GET" && url.pathname === "/api/i18n") {
  const map = await loadTranslations()
  const obj = Object.fromEntries(map)
  return jsonResponse(obj)
}
```

- [ ] **Step 3: 在 StatsPanel、WarningsPanel 中使用 `useI18n`**

将硬编码的中文 label 替换为 `t(英文key)`，确保未来翻译变更时自动生效。

- [ ] **Step 4: Commit**

```bash
git add web/src/client/hooks/useI18n.ts web/src/server/index.ts
git commit -m "feat(web): add useI18n hook and /api/i18n endpoint"
```

---

## Phase 2-5 完成标准

- [ ] `/api/recalculate` 接受 patch 更新配置并返回新 stats
- [ ] ItemsTab 展示所有装备槽，可粘贴替换装备
- [ ] SkillsTab 展示技能石列表，可修改等级/品质/启用
- [ ] ConfigTab 展示常用配置选项，可修改
- [ ] PassiveTreeTab Canvas 渲染被动树，支持拖拽/缩放/点击分配
- [ ] i18n 翻译加载，StatsPanel/WarningsPanel 显示中文 label

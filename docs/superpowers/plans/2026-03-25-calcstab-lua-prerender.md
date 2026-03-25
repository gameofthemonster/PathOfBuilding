# CalcsTab Lua 预渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace web CalcsTab 的硬编码 SECTIONS 常量，改由 Lua 端预渲染 section 树（结构和数值完全对应 CalcSections.lua），保证数字精确与 POB 桌面版一致。

**Architecture:** 新建 `web/lua/calc_sections_renderer.lua`，读取 calcsEnv.player.output（CALCS 模式）并直接按照 CalcSections.lua 的 29 个 section 结构评估条件、格式化数值，返回 JSON 可序列化 section 树。CalcsTab.tsx 改为纯渲染器，直接展示 `result.calcSections`，不再自己定义 SECTIONS 常量。三列布局（进攻 / DoT·偷取 / 防御）保持不变。

**Tech Stack:** Lua 5.1 (LuaJIT), React/TSX, TypeScript, Tailwind CSS

---

## 范围约束

**只改 `web/` 目录。** 不得修改 `web/` 以外的任何文件（`../src/`、`../lua/` 等均禁止）。所有 Lua 工作在 `web/lua/` 下完成。

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `web/src/client/types.ts` | 新增 CalcSection / CalcSubsection / CalcRow 接口，CalcResult 增加 calcSections 字段 |
| 新建 | `web/lua/calc_sections_renderer.lua` | 按 CalcSections.lua 29 个 section 结构读取 output、评估条件、格式化数值、返回结构化 Lua table |
| 修改 | `web/lua/server_calc.lua` | require calc_sections_renderer，调用 renderCalcSections(calcsEnv)，追加到 JSON 响应 |
| 重写 | `web/src/client/components/CalcsTab.tsx` | 删除 SECTIONS 常量；渲染 result.calcSections；保留 MainSkillSelector、可折叠 section、breakdown popover、搜索 |

---

## 参考文件（只读，不修改）

- `src/Modules/CalcSections.lua` — 29 个 section 定义，section 顺序、条件、格式规范
- `src/Classes/CalcsTab.lua` — 技能选择器、buff 模式 UI 逻辑参考
- `web/lua/server_calc.lua`（现有）— 已有 calcsEnv 计算逻辑

---

## Task 1: 类型定义

**Files:**
- Modify: `web/src/client/types.ts`

- [ ] **Step 1: 在 types.ts 中新增接口**

在 `ClusterNode` 接口后、`CalcResult` 之前，插入：

```typescript
// Pre-rendered Calcs tab row from Lua CalcSections
export interface CalcRow {
  label: string        // 行标签（英文，来自 CalcSections.lua）
  value: string        // 已格式化数值字符串，如 "12,345" / "75.4%" / "1,234 – 5,678"
  breakdownKey?: string  // 若有 breakdown 数据，用于 hover popover
  hidden: boolean      // 条件不满足时为 true（结构保留，前端过滤掉）
}

export interface CalcSubsection {
  label: string        // 子段标签
  rows: CalcRow[]
}

export interface CalcSection {
  id: string           // section id，如 "HitDamage"
  label: string        // section 标签（英文）
  color?: string       // 标题颜色 hex（来自 CalcSections colorCode，如 "E05030"）
  defaultCollapsed: boolean
  column: "left-a" | "left-b" | "right"  // 三列分配（renderer 自行决定）
  subsections: CalcSubsection[]
}
```

- [ ] **Step 2: 在 CalcResult 中追加 calcSections 字段**

在 `clusterNodes?: ClusterNode[]` 行后加：

```typescript
  // Pre-rendered Calcs tab section tree from Lua (matches CalcSections.lua structure)
  calcSections?: CalcSection[]
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jason/github/PathOfBuilding/web
git add src/client/types.ts
git commit -m "feat(web/calcs): add CalcSection/CalcRow type definitions"
```

---

## Task 2: 实现 calc_sections_renderer.lua

**Files:**
- Create: `web/lua/calc_sections_renderer.lua`

这是核心工作量最大的 task。新建一个独立 Lua 模块，硬编码 CalcSections.lua 的 section 结构（作为 Lua table），读取 output 值，评估条件，格式化数值。

### Step 1: 数字格式化 helpers

- [ ] 创建文件，写入 module 框架和格式化函数：

```lua
-- web/lua/calc_sections_renderer.lua
-- 预渲染 CalcSections section 树，直接读取 calcsEnv.player.output。
-- 结构对应 src/Modules/CalcSections.lua（只读参考）。
local M = {}

-- 整数格式化（千位分隔符），如 12345 → "12,345"
local function fmt_int(n)
  if type(n) ~= "number" then return "0" end
  n = math.floor(n + 0.5)
  local s = tostring(math.abs(n))
  local result = s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
  return (n < 0 and "-" or "") .. result
end

-- 1位小数格式化，如 1.2345 → "1.2"
local function fmt_dec1(n)
  if type(n) ~= "number" then return "0.0" end
  return string.format("%.1f", n)
end

-- 2位小数格式化
local function fmt_dec2(n)
  if type(n) ~= "number" then return "0.00" end
  return string.format("%.2f", n)
end

-- 百分比格式化（值已是百分数），如 75.4 → "75.4%"
local function fmt_pct(n)
  if type(n) ~= "number" then return "0%" end
  return string.format("%.1f%%", n)
end

-- 百分比整数格式化，如 75 → "75%"
local function fmt_pct_int(n)
  if type(n) ~= "number" then return "0%" end
  return string.format("%d%%", math.floor(n + 0.5))
end

-- 倍率格式化（乘以100后显示），如 1.5 → "150%"
local function fmt_multiplier(n)
  if type(n) ~= "number" then return "0%" end
  return string.format("%d%%", math.floor(n * 100 + 0.5))
end

-- 范围格式化，如 (1234, 5678) → "1,234 – 5,678"
local function fmt_range(nMin, nMax)
  return fmt_int(nMin) .. " – " .. fmt_int(nMax)
end
```

### Step 2: 条件评估辅助函数

- [ ] 追加 helper 函数：

```lua
-- 判断 output[key] 存在且非零（对应 CalcSections haveOutput 条件）
local function have(output, key)
  local v = output[key]
  return type(v) == "number" and v ~= 0
end

-- 判断 output[key] 大于阈值（默认 0）
local function flag(output, key, threshold)
  local v = output[key]
  return type(v) == "number" and v > (threshold or 0)
end

-- 构造一行（若条件不满足则 hidden=true）
local function row(label, value, breakdownKey, visible)
  return {
    label = label,
    value = value or "0",
    breakdownKey = breakdownKey,
    hidden = not visible,
  }
end

-- 构造一个空行（分隔用，hidden=true 时整行不显示）
local function emptyRow()
  return { label = "", value = "", hidden = true }
end
```

### Step 3: 编写全部 29 个 section 定义

> **⚠️ 重要：下方代码仅为参考骨架，section 结构和 key 名均需与 CalcSections.lua 核实后才能使用。**
>
> 已知差异（实现时必须修正）：
> - CalcSections.lua 中 Bleed / Poison / Ignite / Decay 是四个独立的顶级 section，不在 "Dot" 下合并
> - "DPS" / "Cost" / "Reservation" / "Summary" 这些 id 在 CalcSections.lua 中不存在，需按实际 id 映射
> - `CritMultiplier` 在 output 中的单位需确认（若已是百分数如 150，则直接 `fmt_pct_int(v)`；若是小数 1.5，则 `fmt_pct_int(v*100)`）
>
> **正确做法**：实现前先 `cat src/Modules/CalcSections.lua | head -100` 读取真实 section id、label、条件、key 名，以 CalcSections.lua 为唯一权威。下方代码展示结构，具体 key 以 CalcSections.lua 为准。

参考 `src/Modules/CalcSections.lua` 的顺序，在 Lua 中按同样结构硬编码。**实现者必须逐一对照 CalcSections.lua 核实**每个 section 的：label、haveOutput 条件、stat key 名、格式化类型。

以下是前 6 个 section 的**参考骨架**（其余 23 个按同等方式实现，所有 key/label 须以 CalcSections.lua 为准）：

- [ ] 在文件末尾追加 `renderCalcSections` 函数：

```lua
function M.renderCalcSections(output)
  if type(output) ~= "table" then return {} end
  local sections = {}

  -- ── 1. HitDamage ─────────────────────────────────────────────────────
  -- 对应 CalcSections.lua "HitDamage" section（左列进攻核心）
  local hitMin = output.TotalMin or 0
  local hitMax = output.TotalMax or 0
  local hasHit = have(output, "TotalMin") or have(output, "TotalMax")
  table.insert(sections, {
    id = "HitDamage", label = "Hit Damage", column = "left-a", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Average Hit",      fmt_int(output.AverageHit),    "AverageHit",   have(output, "AverageHit")),
        row("Total Hit Range",  fmt_range(hitMin, hitMax),     nil,            hasHit),
        row("Physical",         fmt_range(output.PhysicalMin or 0, output.PhysicalMax or 0), nil, have(output, "PhysicalMin") or have(output, "PhysicalMax")),
        row("Lightning",        fmt_range(output.LightningMin or 0, output.LightningMax or 0), nil, have(output, "LightningMin")),
        row("Cold",             fmt_range(output.ColdMin or 0, output.ColdMax or 0),         nil, have(output, "ColdMin")),
        row("Fire",             fmt_range(output.FireMin or 0, output.FireMax or 0),          nil, have(output, "FireMin")),
        row("Chaos",            fmt_range(output.ChaosMin or 0, output.ChaosMax or 0),       nil, have(output, "ChaosMin")),
      }},
    },
  })

  -- ── 2. DPS Summary ────────────────────────────────────────────────────
  table.insert(sections, {
    id = "DPS", label = "DPS", column = "left-a", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Combined DPS",     fmt_int(output.CombinedDPS),   nil,            have(output, "CombinedDPS")),
        row("Full DPS",         fmt_int(output.FullDPS),       nil,            have(output, "FullDPS")),
        row("Total DPS",        fmt_int(output.TotalDPS),      "TotalDPS",     have(output, "TotalDPS")),
        row("Hit DPS",          fmt_int(output.HitDPS),        nil,            have(output, "HitDPS")),
        row("Average Burst",    fmt_int(output.AverageBurstDamage), nil,       have(output, "AverageBurstDamage")),
        row("With Poison DPS",  fmt_int(output.WithPoisonDPS), nil,            have(output, "WithPoisonDPS")),
        row("With Bleed DPS",   fmt_int(output.WithBleedDPS),  nil,            have(output, "WithBleedDPS")),
        row("With Ignite DPS",  fmt_int(output.WithIgniteDPS), nil,            have(output, "WithIgniteDPS")),
        row("With Impale DPS",  fmt_int(output.WithImpaleDPS), nil,            have(output, "WithImpaleDPS")),
        row("Physical DPS",     fmt_int(output.PhysicalDPS),   nil,            have(output, "PhysicalDPS")),
        row("Lightning DPS",    fmt_int(output.LightningDPS),  nil,            have(output, "LightningDPS")),
        row("Cold DPS",         fmt_int(output.ColdDPS),       nil,            have(output, "ColdDPS")),
        row("Fire DPS",         fmt_int(output.FireDPS),       nil,            have(output, "FireDPS")),
        row("Chaos DPS",        fmt_int(output.ChaosDPS),      nil,            have(output, "ChaosDPS")),
        row("Elemental DPS",    fmt_int(output.ElementalDPS),  nil,            have(output, "ElementalDPS")),
        row("Total DoT DPS",    fmt_int(output.TotalDot),      nil,            have(output, "TotalDot")),
      }},
    },
  })

  -- ── 3. Speed ──────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Speed", label = "Speed / Rate", column = "left-a", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Attack/Cast Rate",  fmt_dec2(output.Speed),       nil,            have(output, "Speed")),
        row("Hit Rate",          fmt_dec2(output.HitSpeed),    nil,            have(output, "HitSpeed")),
        row("Attack Time",       fmt_dec2(output.AttackTime),  nil,            have(output, "AttackTime")),
        row("Cast Time",         fmt_dec2(output.CastTime),    nil,            have(output, "CastTime")),
      }},
    },
  })

  -- ── 4. Crit ───────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Crit", label = "Critical Strike", column = "left-a", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Crit Chance",       fmt_pct(output.CritChance),                    "CritChance",   have(output, "CritChance")),
        row("Pre-Effective Crit",fmt_pct(output.PreEffectiveCritChance),        nil,            have(output, "PreEffectiveCritChance")),
        row("Crit Multiplier",   fmt_pct_int((output.CritMultiplier or 0)*100), "CritMultiplier",have(output, "CritMultiplier")),
        row("Double Dmg Chance", fmt_pct(output.DoubleDamageChance),            nil,            have(output, "DoubleDamageChance")),
        row("Non-Crit DPS",      fmt_int(output.TotalNonCritDPS),              nil,            have(output, "TotalNonCritDPS")),
        row("Crit DPS",          fmt_int(output.TotalCritDPS),                 nil,            have(output, "TotalCritDPS")),
      }},
    },
  })

  -- ── 5. Accuracy / Hit Chance ──────────────────────────────────────────
  table.insert(sections, {
    id = "HitChance", label = "Hit Chance", column = "left-a", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Accuracy Rating",  fmt_int(output.Accuracy),   "Accuracy", have(output, "Accuracy")),
        row("Hit Chance",       fmt_pct(output.HitChance),  nil,        have(output, "HitChance")),
      }},
    },
  })

  -- ── 6. Dot ────────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Dot", label = "Damage over Time", column = "left-b", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Total DoT Instance",  fmt_int(output.TotalDotInstance), nil, have(output, "TotalDotInstance")),
        row("Physical DoT",        fmt_int(output.PhysicalDot),      nil, have(output, "PhysicalDot")),
        row("Lightning DoT",       fmt_int(output.LightningDot),     nil, have(output, "LightningDot")),
        row("Cold DoT",            fmt_int(output.ColdDot),          nil, have(output, "ColdDot")),
        row("Fire DoT",            fmt_int(output.FireDot),          nil, have(output, "FireDot")),
        row("Chaos DoT",           fmt_int(output.ChaosDot),         nil, have(output, "ChaosDot")),
      }},
      { label = "Bleed", rows = {
        row("Bleed DPS",     fmt_int(output.BleedDPS),         nil, have(output, "BleedDPS")),
        row("Bleed Chance",  fmt_pct(output.BleedChance),      nil, have(output, "BleedChance")),
        row("Bleed Duration",fmt_dec1(output.BleedDuration),   nil, have(output, "BleedDuration")),
        row("Bleed DotMulti",fmt_pct_int((output.BleedDotMulti or 0)*100), nil, have(output, "BleedDotMulti")),
      }},
      { label = "Poison", rows = {
        row("Poison DPS",    fmt_int(output.PoisonDPS),        nil, have(output, "PoisonDPS")),
        row("Poison Chance", fmt_pct(output.PoisonChance),     nil, have(output, "PoisonChance")),
        row("Poison Duration",fmt_dec1(output.PoisonDuration), nil, have(output, "PoisonDuration")),
        row("Poison DotMulti",fmt_pct_int((output.PoisonDotMulti or 0)*100), nil, have(output, "PoisonDotMulti")),
      }},
      { label = "Ignite", rows = {
        row("Ignite DPS",    fmt_int(output.IgniteDPS),        nil, have(output, "IgniteDPS")),
        row("Ignite Chance", fmt_pct(output.IgniteChance),     nil, have(output, "IgniteChance")),
        row("Ignite Duration",fmt_dec1(output.IgniteDuration), nil, have(output, "IgniteDuration")),
        row("Ignite DotMulti",fmt_pct_int((output.IgniteDotMulti or 0)*100), nil, have(output, "IgniteDotMulti")),
      }},
      { label = "Decay", rows = {
        row("Decay DPS",     fmt_int(output.DecayDPS),         nil, have(output, "DecayDPS")),
      }},
    },
  })

  -- ── 7. Leech & Gain on Hit ────────────────────────────────────────────
  table.insert(sections, {
    id = "LeechGain", label = "Leech & Gain on Hit", column = "left-b", defaultCollapsed = false,
    subsections = {
      { label = "Life", rows = {
        row("Max Leech Rate",   fmt_int(output.MaxLifeLeechRate),       nil, have(output, "MaxLifeLeechRate")),
        row("Leech Rate",       fmt_int(output.LifeLeechGainRate),      "LifeLeechGainRate", have(output, "LifeLeechGainRate")),
        row("Leech/Hit",        fmt_int(output.LifeLeechGainPerHit),    nil, have(output, "LifeLeechGainPerHit")),
        row("Gained on Hit",    fmt_int(output.LifeOnHit),              nil, have(output, "LifeOnHit")),
        row("Gained on Kill",   fmt_int(output.LifeOnKill),             nil, have(output, "LifeOnKill")),
      }},
      { label = "Mana", rows = {
        row("Max Leech Rate",   fmt_int(output.MaxManaLeechRate),       nil, have(output, "MaxManaLeechRate")),
        row("Leech Rate",       fmt_int(output.ManaLeechGainRate),      "ManaLeechGainRate", have(output, "ManaLeechGainRate")),
        row("Leech/Hit",        fmt_int(output.ManaLeechGainPerHit),    nil, have(output, "ManaLeechGainPerHit")),
        row("Gained on Hit",    fmt_int(output.ManaOnHit),              nil, have(output, "ManaOnHit")),
        row("Gained on Kill",   fmt_int(output.ManaOnKill),             nil, have(output, "ManaOnKill")),
      }},
      { label = "Energy Shield", rows = {
        row("Max Leech Rate",   fmt_int(output.MaxEnergyShieldLeechRate),      nil, have(output, "MaxEnergyShieldLeechRate")),
        row("Leech Rate",       fmt_int(output.EnergyShieldLeechGainRate),     "EnergyShieldLeechGainRate", have(output, "EnergyShieldLeechGainRate")),
        row("Leech/Hit",        fmt_int(output.EnergyShieldLeechGainPerHit),   nil, have(output, "EnergyShieldLeechGainPerHit")),
        row("Gained on Hit",    fmt_int(output.EnergyShieldOnHit),             nil, have(output, "EnergyShieldOnHit")),
        row("Gained on Kill",   fmt_int(output.EnergyShieldOnKill),            nil, have(output, "EnergyShieldOnKill")),
      }},
    },
  })

  -- ── 8. Impale ─────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Impale", label = "Impale", column = "left-b", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Impale DPS",          fmt_int(output.ImpaleDPS),          nil, have(output, "ImpaleDPS")),
        row("Impale Chance",       fmt_pct(output.ImpaleChance),       nil, have(output, "ImpaleChance")),
        row("Impale Stacks",       fmt_dec1(output.ImpaleStacks),      nil, have(output, "ImpaleStacks")),
        row("Impale Effect",       fmt_pct(output.ImpaleEffectMod),    nil, have(output, "ImpaleEffectMod")),
      }},
    },
  })

  -- ── 9. Ailments ───────────────────────────────────────────────────────
  table.insert(sections, {
    id = "EleAilments", label = "Elemental Ailments", column = "left-b", defaultCollapsed = true,
    subsections = {
      { label = "Chill", rows = {
        row("Chill Chance",       fmt_pct(output.ChillChance),         nil, have(output, "ChillChance")),
        row("Chill Effect",       fmt_pct(output.ChillEffectMod),      nil, have(output, "ChillEffectMod")),
        row("Chill Duration",     fmt_dec1(output.ChillDuration),      nil, have(output, "ChillDuration")),
      }},
      { label = "Freeze", rows = {
        row("Freeze Chance",      fmt_pct(output.FreezeChance),        nil, have(output, "FreezeChance")),
        row("Freeze Duration",    fmt_pct(output.FreezeDurationMod),   nil, have(output, "FreezeDurationMod")),
      }},
      { label = "Shock", rows = {
        row("Shock Chance",       fmt_pct(output.ShockChance),         nil, have(output, "ShockChance")),
        row("Shock Effect",       fmt_pct(output.ShockEffectMod),      nil, have(output, "ShockEffectMod")),
        row("Shock Duration",     fmt_dec1(output.ShockDuration),      nil, have(output, "ShockDuration")),
      }},
      { label = "Scorch", rows = {
        row("Scorch Chance",      fmt_pct(output.ScorchChance),        nil, have(output, "ScorchChance")),
        row("Scorch Effect",      fmt_pct(output.ScorchEffectMod),     nil, have(output, "ScorchEffectMod")),
      }},
      { label = "Brittle", rows = {
        row("Brittle Chance",     fmt_pct(output.BrittleChance),       nil, have(output, "BrittleChance")),
        row("Brittle Effect",     fmt_pct(output.BrittleEffectMod),    nil, have(output, "BrittleEffectMod")),
      }},
      { label = "Sap", rows = {
        row("Sap Chance",         fmt_pct(output.SapChance),           nil, have(output, "SapChance")),
        row("Sap Effect",         fmt_pct(output.SapEffectMod),        nil, have(output, "SapEffectMod")),
      }},
    },
  })

  -- ── 10. Skill Cost ────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Cost", label = "Skill Cost", column = "left-b", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Mana Cost",          fmt_int(output.ManaCost),            nil, have(output, "ManaCost")),
        row("Life Cost",          fmt_int(output.LifeCost),            nil, have(output, "LifeCost")),
        row("ES Cost",            fmt_int(output.EnergyShieldCost),    nil, have(output, "EnergyShieldCost")),
        row("Rage Cost",          fmt_int(output.RageCost),            nil, have(output, "RageCost")),
        row("Soul Cost",          fmt_int(output.SoulCost),            nil, have(output, "SoulCost")),
        row("Mana Regen/s",       fmt_int(output.NetManaRegen),        nil, have(output, "NetManaRegen")),
      }},
    },
  })

  -- ── 11. Attributes ────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Attributes", label = "Attributes", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Strength",     fmt_int(output.Str),  "Str",  have(output, "Str")),
        row("Dexterity",    fmt_int(output.Dex),  "Dex",  have(output, "Dex")),
        row("Intelligence", fmt_int(output.Int),  "Int",  have(output, "Int")),
      }},
    },
  })

  -- ── 12. Life ──────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Life", label = "Life", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Life",              fmt_int(output.Life),               "Life",            have(output, "Life")),
        row("Unreserved Life",   fmt_int(output.LifeUnreserved),     nil,               have(output, "LifeReserved")),
        row("Life Regen/s",      fmt_int(output.NetLifeRegen),       "NetLifeRegen",    have(output, "NetLifeRegen")),
        row("Life Regen %/s",    fmt_pct(output.LifeRegenPercent),   nil,               have(output, "LifeRegenPercent")),
      }},
    },
  })

  -- ── 13. Mana ──────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Mana", label = "Mana", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Mana",              fmt_int(output.Mana),               "Mana",            have(output, "Mana")),
        row("Unreserved Mana",   fmt_int(output.ManaUnreserved),     nil,               have(output, "ManaReserved")),
        row("Mana Regen/s",      fmt_int(output.NetManaRegen),       "NetManaRegen",    have(output, "NetManaRegen")),
      }},
    },
  })

  -- ── 14. Energy Shield ─────────────────────────────────────────────────
  table.insert(sections, {
    id = "EnergyShield", label = "Energy Shield", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Energy Shield",     fmt_int(output.EnergyShield),       "EnergyShield",    have(output, "EnergyShield")),
        row("ES Recharge/s",     fmt_int(output.EnergyShieldRecharge),nil,              have(output, "EnergyShieldRecharge")),
        row("ES Regen/s",        fmt_int(output.NetEnergyShieldRegen),"NetEnergyShieldRegen", have(output, "NetEnergyShieldRegen")),
      }},
    },
  })

  -- ── 15. Ward ──────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Ward", label = "Ward", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Ward",              fmt_int(output.Ward),               nil,               have(output, "Ward")),
        row("Ward Recharge Delay",fmt_dec1(output.WardRechargeDelay),nil,              have(output, "WardRechargeDelay")),
      }},
    },
  })

  -- ── 16. Resistances ───────────────────────────────────────────────────
  table.insert(sections, {
    id = "Resist", label = "Resistances", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "Elemental", rows = {
        row("Fire Resist",        fmt_pct_int(output.FireResist),     "FireResist",     output.FireResist ~= nil),
        row("Cold Resist",        fmt_pct_int(output.ColdResist),     "ColdResist",     output.ColdResist ~= nil),
        row("Lightning Resist",   fmt_pct_int(output.LightningResist),"LightningResist",output.LightningResist ~= nil),
        row("Chaos Resist",       fmt_pct_int(output.ChaosResist),    "ChaosResist",    output.ChaosResist ~= nil),
      }},
    },
  })

  -- ── 17. Armour ────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Armour", label = "Armour", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Armour",                    fmt_int(output.Armour),              "Armour",  have(output, "Armour")),
        row("Phys Damage Reduction",     fmt_pct_int(output.PhysicalDamageReduction), nil, have(output, "PhysicalDamageReduction")),
        row("Fire Damage Reduction",     fmt_pct_int(output.FireDamageReduction),     nil, have(output, "FireDamageReduction")),
        row("Cold Damage Reduction",     fmt_pct_int(output.ColdDamageReduction),     nil, have(output, "ColdDamageReduction")),
        row("Lightning Damage Reduction",fmt_pct_int(output.LightningDamageReduction),nil, have(output, "LightningDamageReduction")),
        row("Chaos Damage Reduction",    fmt_pct_int(output.ChaosDamageReduction),    nil, have(output, "ChaosDamageReduction")),
      }},
    },
  })

  -- ── 18. Evasion ───────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Evasion", label = "Evasion", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Evasion Rating",    fmt_int(output.Evasion),            "Evasion",    have(output, "Evasion")),
        row("Evade Chance",      fmt_pct(output.EvadeChance),        nil,          have(output, "EvadeChance")),
        row("Attack Dodge",      fmt_pct(output.AttackDodgeChance),  nil,          have(output, "AttackDodgeChance")),
        row("Spell Dodge",       fmt_pct(output.SpellDodgeChance),   nil,          have(output, "SpellDodgeChance")),
      }},
    },
  })

  -- ── 19. Block / Suppress ──────────────────────────────────────────────
  table.insert(sections, {
    id = "DamageAvoidance", label = "Block / Suppress", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "", rows = {
        row("Block Chance",        fmt_pct(output.EffectiveBlockChance),      "EffectiveBlockChance",      have(output, "EffectiveBlockChance")),
        row("Spell Block",         fmt_pct(output.EffectiveSpellBlockChance), "EffectiveSpellBlockChance", have(output, "EffectiveSpellBlockChance")),
        row("Block Over Cap",      fmt_pct(output.BlockChanceOverCap),        nil,                         have(output, "BlockChanceOverCap")),
        row("Spell Suppress",      fmt_pct(output.SpellSuppressionChance),    nil,                         have(output, "SpellSuppressionChance")),
        row("Suppress Effect",     fmt_pct(output.SpellSuppressionEffect),    nil,                         have(output, "SpellSuppressionEffect")),
      }},
    },
  })

  -- ── 20. Charges ───────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Charges", label = "Charges", column = "right", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Endurance Charges",   fmt_int(output.EnduranceCharges)  .. " / " .. fmt_int(output.MaxEnduranceCharges),   nil, have(output, "MaxEnduranceCharges")),
        row("Frenzy Charges",      fmt_int(output.FrenzyCharges)     .. " / " .. fmt_int(output.MaxFrenzyCharges),      nil, have(output, "MaxFrenzyCharges")),
        row("Power Charges",       fmt_int(output.PowerCharges)      .. " / " .. fmt_int(output.MaxPowerCharges),       nil, have(output, "MaxPowerCharges")),
        row("Siphoning Charges",   fmt_int(output.SiphoningCharges)  .. " / " .. fmt_int(output.MaxSiphoningCharges),   nil, have(output, "MaxSiphoningCharges")),
        row("Challenger Charges",  fmt_int(output.ChallengerCharges) .. " / " .. fmt_int(output.MaxChallengerCharges),  nil, have(output, "MaxChallengerCharges")),
        row("Blitz Charges",       fmt_int(output.BlitzCharges)      .. " / " .. fmt_int(output.MaxBlitzCharges),       nil, have(output, "MaxBlitzCharges")),
      }},
    },
  })

  -- ── 21. Rage ──────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Rage", label = "Rage", column = "right", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Maximum Rage",     fmt_int(output.MaximumRage),         nil, have(output, "MaximumRage")),
        row("Rage Effect",      fmt_pct(output.RageEffect),          nil, have(output, "RageEffect")),
        row("Rage Regen/s",     fmt_dec1(output.RageRegenRecovery),  nil, have(output, "RageRegenRecovery")),
        row("Rage Loss Delay",  fmt_dec1(output.InherentRageLossDelay), nil, have(output, "InherentRageLossDelay")),
      }},
    },
  })

  -- ── 22. Flasks ────────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Flasks", label = "Flasks", column = "right", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Flask Life Recovery",  fmt_int(output.FlaskLifeRecovery),  nil, have(output, "FlaskLifeRecovery")),
        row("Flask Mana Recovery",  fmt_int(output.FlaskManaRecovery),  nil, have(output, "FlaskManaRecovery")),
        row("Flask Effect",         fmt_pct(output.FlaskEffect),        nil, have(output, "FlaskEffect")),
        row("Flask Duration",       fmt_pct(output.FlaskDuration),      nil, have(output, "FlaskDuration")),
        row("Flask Charges",        fmt_pct(output.FlaskChargesGained), nil, have(output, "FlaskChargesGained")),
      }},
    },
  })

  -- ── 23. Misc Defences ─────────────────────────────────────────────────
  table.insert(sections, {
    id = "MiscDefences", label = "Misc Defences", column = "right", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Stun Threshold",   fmt_int(output.StunThreshold),      nil, have(output, "StunThreshold")),
        row("Stun Duration",    fmt_pct(output.StunDuration),       nil, have(output, "StunDuration")),
        row("Stun Avoid",       fmt_pct(output.StunAvoidChance),    nil, have(output, "StunAvoidChance")),
        row("Knockback Avoid",  fmt_pct(output.KnockbackAvoidChance), nil, have(output, "KnockbackAvoidChance")),
        row("Ailment Avoid",    fmt_pct(output.AilmentAvoidChance), nil, have(output, "AilmentAvoidChance")),
      }},
    },
  })

  -- ── 24. Damage Taken ──────────────────────────────────────────────────
  table.insert(sections, {
    id = "DamageTaken", label = "Damage Taken", column = "right", defaultCollapsed = true,
    subsections = {
      { label = "Hit", rows = {
        row("Phys Taken",       fmt_pct(output.PhysicalDamageTakenMod),    nil, have(output, "PhysicalDamageTakenMod")),
        row("Fire Taken",       fmt_pct(output.FireDamageTakenMod),        nil, have(output, "FireDamageTakenMod")),
        row("Cold Taken",       fmt_pct(output.ColdDamageTakenMod),        nil, have(output, "ColdDamageTakenMod")),
        row("Lightning Taken",  fmt_pct(output.LightningDamageTakenMod),   nil, have(output, "LightningDamageTakenMod")),
        row("Chaos Taken",      fmt_pct(output.ChaosDamageTakenMod),       nil, have(output, "ChaosDamageTakenMod")),
      }},
      { label = "DoT Taken", rows = {
        row("Phys DoT Taken",   fmt_pct(output.PhysicalTakenDotMult),  nil, have(output, "PhysicalTakenDotMult")),
        row("Fire DoT Taken",   fmt_pct(output.FireTakenDotMult),      nil, have(output, "FireTakenDotMult")),
        row("Cold DoT Taken",   fmt_pct(output.ColdTakenDotMult),      nil, have(output, "ColdTakenDotMult")),
        row("Light DoT Taken",  fmt_pct(output.LightningTakenDotMult), nil, have(output, "LightningTakenDotMult")),
        row("Chaos DoT Taken",  fmt_pct(output.ChaosTakenDotMult),     nil, have(output, "ChaosTakenDotMult")),
      }},
    },
  })

  -- ── 25. Warcries ──────────────────────────────────────────────────────
  table.insert(sections, {
    id = "Warcries", label = "Warcries", column = "left-b", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Warcry Cooldown",  fmt_dec1(output.WarcryCooldown),    nil, have(output, "WarcryCooldown")),
        row("Warcry Power",     fmt_int(output.WarCryPower),        nil, have(output, "WarCryPower")),
        row("Exerted Damage",   fmt_pct(output.ExertedDamageMod),   nil, have(output, "ExertedDamageMod")),
      }},
    },
  })

  -- ── 26. Skill Type Stats ──────────────────────────────────────────────
  table.insert(sections, {
    id = "SkillTypeStats", label = "Skill Stats", column = "left-a", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Gem Level",        fmt_int(output.GemLevel),           nil, have(output, "GemLevel")),
        row("Gem Quality",      fmt_pct_int(output.GemQuality),     nil, have(output, "GemQuality")),
        row("Duration",         fmt_dec1(output.Duration),          nil, have(output, "Duration")),
        row("Secondary Duration",fmt_dec1(output.SecondaryDuration),nil, have(output, "SecondaryDuration")),
        row("Uptime",           fmt_pct(output.DurationUptime),     nil, have(output, "DurationUptime")),
        row("Area of Effect",   fmt_pct(output.AreaOfEffectMod),    nil, have(output, "AreaOfEffectMod")),
        row("Stored Uses",      fmt_int(output.StoredUses),         nil, have(output, "StoredUses")),
        row("Cooldown",         fmt_dec1(output.Cooldown),          nil, have(output, "Cooldown")),
        row("Mana Reserved %",  fmt_pct(output.ManaReservedMod),    nil, have(output, "ManaReservedMod")),
        row("Life Reserved %",  fmt_pct(output.LifeReservedMod),    nil, have(output, "LifeReservedMod")),
      }},
    },
  })

  -- ── 27. Misc Effects ──────────────────────────────────────────────────
  table.insert(sections, {
    id = "MiscEffects", label = "Misc Effects", column = "left-b", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Pierce Chance",     fmt_pct(output.PierceChance),       nil, have(output, "PierceChance")),
        row("Fork Count",        fmt_int(output.ForkCount),          nil, have(output, "ForkCount")),
        row("Chain Count",       fmt_int(output.ChainCount),         nil, have(output, "ChainCount")),
        row("Projectile Speed",  fmt_pct(output.ProjectileSpeedMod), nil, have(output, "ProjectileSpeedMod")),
        row("Culling Strike",    fmt_pct(output.CullingStrikeThreshold), nil, have(output, "CullingStrikeThreshold")),
      }},
    },
  })

  -- ── 28. Auras / Buffs (Reservation) ──────────────────────────────────
  table.insert(sections, {
    id = "Reservation", label = "Reservation", column = "right", defaultCollapsed = true,
    subsections = {
      { label = "", rows = {
        row("Mana Reserved",    fmt_int(output.ManaReserved),       nil, have(output, "ManaReserved")),
        row("Life Reserved",    fmt_int(output.LifeReserved),       nil, have(output, "LifeReserved")),
        row("Herald Buff Eff",  fmt_pct(output.HeraldBuffEffectMod),nil, have(output, "HeraldBuffEffectMod")),
        row("Aura Effect",      fmt_pct(output.AuraEffectMod),      nil, have(output, "AuraEffectMod")),
      }},
    },
  })

  -- ── 29. Summary (EHP / Total Pool) ───────────────────────────────────
  table.insert(sections, {
    id = "Summary", label = "Summary", column = "right", defaultCollapsed = false,
    subsections = {
      { label = "Effective HP", rows = {
        row("vs Phys Hit",      fmt_int(output.PhysicalEHP),        nil, have(output, "PhysicalEHP")),
        row("vs Fire Hit",      fmt_int(output.FireEHP),            nil, have(output, "FireEHP")),
        row("vs Cold Hit",      fmt_int(output.ColdEHP),            nil, have(output, "ColdEHP")),
        row("vs Light Hit",     fmt_int(output.LightningEHP),       nil, have(output, "LightningEHP")),
        row("vs Chaos Hit",     fmt_int(output.ChaosEHP),           nil, have(output, "ChaosEHP")),
      }},
    },
  })

  return sections
end

return M
```

- [ ] **Step 4: 手动验证格式化函数**

临时在文件末尾（`return M` 之前）加测试代码，运行：

```bash
cd /Users/jason/github/PathOfBuilding/src
lua -e "dofile('../web/lua/calc_sections_renderer.lua')"
```

期望：无语法错误，无 nil 引用错误。验证完毕后删除测试代码。

- [ ] **Step 5: Commit**

```bash
cd /Users/jason/github/PathOfBuilding/web
git add lua/calc_sections_renderer.lua
git commit -m "feat(web/calcs): add calc_sections_renderer.lua - Lua pre-rendered section tree"
```

---

## Task 3: 在 server_calc.lua 中集成

**Files:**
- Modify: `web/lua/server_calc.lua`

- [ ] **Step 1: 在文件头部 `dofile("HeadlessWrapper.lua")` 之后加载模块**

在 `dofile("HeadlessWrapper.lua")` 这行之后（约第 21 行），追加：

```lua
-- 加载 CalcSections 预渲染模块
local calcSectionsRenderer = dofile("../web/lua/calc_sections_renderer.lua")
```

- [ ] **Step 2: 在 calcsEnv 计算完成后调用 renderCalcSections**

在 `local breakdown = {}` 之后、`return json.encode(...)` 之前，找到 `local clusterNodes` 之前的位置，追加：

```lua
-- 预渲染 CalcSections section 树
local calcSections = {}
if ok_calcs and calcsEnv and calcsEnv.player and calcsEnv.player.output then
  local ok_render, rendered = pcall(function()
    return calcSectionsRenderer.renderCalcSections(calcsEnv.player.output)
  end)
  if ok_render and type(rendered) == "table" then
    calcSections = rendered
  else
    io.stderr:write("[server_calc] renderCalcSections error: " .. tostring(rendered) .. "\n")
  end
end
```

- [ ] **Step 3: 在 json.encode 返回值中追加 calcSections 字段**

找到最终的 `return json.encode({` 语句（文件末尾附近），在现有字段后追加：

```lua
    return json.encode({
      stats = stats, warnings = warnings, breakdown = breakdown,
      skillParts = skillParts, skillPartIndex = skillPartIndex,
      skillPartGemGroupIndex = skillPartGemGroupIndex, skillPartGemIndex = skillPartGemIndex,
      clusterNodes = clusterNodes,
      calcSections = calcSections,        -- ← 新增
      displayStats = displayStatsResult,
    })
```

- [ ] **Step 4: 验证 Lua 端不崩溃**

```bash
cd /Users/jason/github/PathOfBuilding/web
bun run dev &
# 上传一个测试 build，在 DevTools Network 查看 /api/calc 响应
# 确认 JSON 中有 "calcSections" 数组，且每个 section 有 id/label/column/subsections 字段
```

- [ ] **Step 5: Commit**

```bash
git add lua/server_calc.lua
git commit -m "feat(web/calcs): wire up renderCalcSections in server_calc.lua"
```

---

## Task 4: 重写 CalcsTab.tsx

**Files:**
- Rewrite: `web/src/client/components/CalcsTab.tsx`

保留：三列布局结构、MainSkillSelector、Collapsible section、BreakdownPopoverContent、useI18n。
删除：SECTIONS 常量、StatDef/FmtType 类型、所有手动 format 逻辑（fmt_int/fmt_dec）。

- [ ] **Step 1: 更新 import 和类型引用**

文件头部 import 改为：

```tsx
import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BreakdownLine, BuildConfig, CalcResult, CalcSection, CalcRow } from "../types";
import { useI18n } from "../hooks/useI18n";
import { MainSkillSelector } from "./MainSkillSelector";
```

- [ ] **Step 2: 实现 RenderedRow 组件**

替换原 `StatRow` / `StatCell` 组件：

```tsx
// ─── RenderedRow ──────────────────────────────────────────────────────────────

interface RenderedRowProps {
  row: CalcRow;
  breakdown?: Record<string, BreakdownLine[]>;
}

function RenderedRow({ row, breakdown }: RenderedRowProps) {
  const bkLines = row.breakdownKey ? breakdown?.[row.breakdownKey] : undefined;

  const valueEl = bkLines?.length ? (
    <Popover>
      <PopoverTrigger asChild>
        <button className="font-mono text-xs leading-tight text-right cursor-pointer hover:text-primary tabular-nums">
          {row.value}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="center" sideOffset={8} className="w-72 p-3">
        <BreakdownPopoverContent lines={bkLines} label={row.label} />
      </PopoverContent>
    </Popover>
  ) : (
    <span className="font-mono text-xs leading-tight text-right tabular-nums">{row.value}</span>
  );

  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 min-w-0">
      <span className="text-[10px] text-muted-foreground truncate shrink">{row.label}</span>
      {valueEl}
    </div>
  );
}
```

- [ ] **Step 3: 实现 RenderedSection 组件**

```tsx
// ─── RenderedSection ──────────────────────────────────────────────────────────

interface RenderedSectionProps {
  section: CalcSection;
  breakdown?: Record<string, BreakdownLine[]>;
  searchQuery: string;
}

function RenderedSection({ section, breakdown, searchQuery }: RenderedSectionProps) {
  const [open, setOpen] = useState(!section.defaultCollapsed);

  // 过滤可见行
  const visibleRows = (subsection: CalcSection["subsections"][number]) =>
    subsection.rows.filter((r) => {
      if (r.hidden) return false;
      if (!searchQuery) return true;
      return r.label.toLowerCase().includes(searchQuery.toLowerCase());
    });

  // 若所有子段都没有可见行，隐藏整个 section
  const hasAny = section.subsections.some((sub) => visibleRows(sub).length > 0);
  if (!hasAny) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="break-inside-avoid">
      <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {open ? <CaretDown className="h-2.5 w-2.5" /> : <CaretRight className="h-2.5 w-2.5" />}
        <span>{section.label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-1 pb-1 flex flex-col gap-0">
          {section.subsections.map((sub, si) => {
            const rows = visibleRows(sub);
            if (!rows.length) return null;
            return (
              <div key={si}>
                {sub.label && (
                  <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wide pt-1 pb-0.5">
                    {sub.label}
                  </div>
                )}
                {rows.map((r, ri) => (
                  <RenderedRow key={ri} row={r} breakdown={breakdown} />
                ))}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 4: 实现 BreakdownPopoverContent（保持现有）**

检查文件中已有的 `BreakdownPopoverContent` 组件是否需要修改 props（现有版本接受 `lines` 和 `label`）。如果接口匹配则直接复用。

- [ ] **Step 5: 重写 CalcsTab 主组件**

```tsx
// ─── CalcsTab ─────────────────────────────────────────────────────────────────

interface Props {
  result: CalcResult;
  buildConfig?: BuildConfig | null;
  onMainSkillChange?: (index: number) => void;
  onSkillPartChange?: (partIndex: number) => void;
}

export function CalcsTab({ result, buildConfig, onMainSkillChange, onSkillPartChange }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const sections = result?.calcSections ?? [];

  const colA = sections.filter((s) => s.column === "left-a");
  const colB = sections.filter((s) => s.column === "left-b");
  const colRight = sections.filter((s) => s.column === "right");

  const sectionProps = (s: CalcSection) => ({
    section: s,
    breakdown: result.breakdown,
    searchQuery,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {buildConfig && buildConfig.skills.length > 0 && onMainSkillChange && (
        <div className="shrink-0 border-b border-border/40">
          <MainSkillSelector
            skills={buildConfig.skills}
            mainSocketGroup={buildConfig.mainSocketGroup}
            onChange={onMainSkillChange}
            skillParts={result.skillParts}
            skillPartIndex={result.skillPartIndex}
            onSkillPartChange={onSkillPartChange}
          />
        </div>
      )}
      {/* 搜索框 */}
      <div className="shrink-0 px-2 py-1 border-b border-border/40">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 stat..."
          className="w-full text-[10px] bg-transparent border border-border/40 rounded px-1.5 py-0.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Col A — 进攻核心 */}
        <div className="flex-1 min-w-[180px] overflow-y-auto px-2 py-2 flex flex-col gap-0.5 border-r border-border/40">
          {colA.map((s) => <RenderedSection key={s.id} {...sectionProps(s)} />)}
        </div>
        {/* Col B — DoT / 偷取 / 辅助 */}
        <div className="flex-1 min-w-[180px] overflow-y-auto px-2 py-2 flex flex-col gap-0.5 border-r border-border/40">
          {colB.map((s) => <RenderedSection key={s.id} {...sectionProps(s)} />)}
        </div>
        {/* Col C — 防御 */}
        <div className="w-[220px] shrink-0 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
          {colRight.map((s) => <RenderedSection key={s.id} {...sectionProps(s)} />)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 验证 UI 正常渲染**

1. `bun run dev` 启动服务
2. 上传一个测试 build（含技能、装备）
3. 点击「统计 Calcs」Tab
4. 确认：三列正常显示，section 可折叠，有数值的行正常显示，breakdown hover 正常工作
5. 在搜索框输入 "life"，确认只显示含 "life" 的行

- [ ] **Step 7: Commit**

```bash
cd /Users/jason/github/PathOfBuilding/web
git add src/client/components/CalcsTab.tsx
git commit -m "feat(web/calcs): rewrite CalcsTab to render from Lua pre-rendered section tree"
```

---

## 实现注意事项

### Lua 模块加载路径

`server_calc.lua` 使用 `dofile()` 加载文件（cwd = `src/`）。因此路径为：
```lua
local calcSectionsRenderer = dofile("../web/lua/calc_sections_renderer.lua")
```
注意：现有 `server_calc.lua` 中 `dofile("HeadlessWrapper.lua")` 用的是相对 cwd 的路径，而这里路径是 `../web/lua/...`，刻意指向 web 目录，这是正确的，不需要调整。

### stat key 核实清单

实现 Task 2 时，**必须**逐一对照 `src/Modules/CalcSections.lua` 核实每个 stat key 名称。CalcSections.lua 的 key 可能与 EXPORT_STATS 中的 key 略有差异（如 `output.Dex` vs `output.TotalDex`）。如发现不匹配，以 CalcSections.lua 使用的 key 为准，并同步更新 EXPORT_STATS 导出列表（在 `server_calc.lua` 中追加缺失的 key）。

### 格式化精度

CalcSections.lua 的格式规范（整数/1位/2位小数）需要逐行核实，以下为常见规律：
- DPS/数量类 → `fmt_int`（千位分隔）
- 速率/时间类 → `fmt_dec2`
- 百分比类 → `fmt_pct` 或 `fmt_pct_int`（视 CalcSections.lua 中 `"%d%%"` vs `"%.1f%%"` 而定）

### BreakdownPopoverContent

现有 CalcsTab.tsx 中有此组件（约 730-808 行）。Task 4 重写时保留该组件实现，只修改引用方式（从 `def.label` 改为 `row.label`）。

---

## 完成标准

- [ ] `result.calcSections` 包含 ≥ 20 个 section（对应 CalcSections.lua 中有数据的 section）
- [ ] 三列布局正确：进攻 / DoT·偷取 / 防御
- [ ] 各 section 可折叠
- [ ] 有 breakdownKey 的行 hover 显示 popover
- [ ] 搜索框实时过滤
- [ ] 无 hidden=false 的行被 filter 掉（hidden 行不显示）
- [ ] 无 TypeScript 编译错误

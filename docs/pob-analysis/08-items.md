# 装备系统

## 装备槽

POB 支持以下装备槽（`src/Classes/ItemsTab.lua`）：

| 槽名 | 说明 |
|------|------|
| `Weapon 1` | 主手武器 |
| `Weapon 2` | 副手武器/盾牌 |
| `Weapon 1 Swap` | 换装主手 |
| `Weapon 2 Swap` | 换装副手 |
| `Helmet` | 头盔 |
| `Body Armour` | 身体护甲 |
| `Gloves` | 手套 |
| `Boots` | 靴子 |
| `Amulet` | 护身符 |
| `Ring 1` | 戒指 1 |
| `Ring 2` | 戒指 2 |
| `Belt` | 腰带 |
| `Flask 1-5` | 烧瓶 1-5 |
| `Jewel 1-N` | 宝珠（被动树插槽）|

## 装备文本格式（来自游戏 Ctrl+C）

```
Rarity: UNIQUE
Shaper's Touch
Eelskin Gloves
--------
Quality: +20% (augmented)
Evasion Rating: 241 (augmented)
--------
Requirements:
Level: 56
Dex: 95
--------
Sockets: G-G-G-G
--------
Item Level: 75
--------
100% increased Armour and Evasion
+30 to Strength
+30 to Dexterity
+30 to Intelligence
2% increased Attributes per 1 Strength
...
```

装备文本直接粘贴到 POB，`Item.lua` 的 `ParseRaw()` 负责解析。

## 装备解析流程（Item.lua）

```lua
-- 1. 解析原始文本
item:ParseRaw(text, rarity, highQuality)

-- 2. 关键字段解析
item.rarity       -- NORMAL / MAGIC / RARE / UNIQUE
item.name         -- 装备名（unique name 或 rare name）
item.base         -- 基础类型名（"Eelskin Gloves"）
item.type         -- 装备类型（"Helmet" / "BodyArmour" 等）
item.level        -- 装备等级
item.quality      -- 品质
item.sockets      -- 插槽配置（"R-G-B B G"）
item.influences   -- 影响标志（shaper, elder, crusader 等）
item.corrupted    -- 是否腐化

-- 3. 解析词缀行
item.modLines     -- 所有词缀行（含 implicit, explicit, crafted 等）
item.modList      -- 解析后的 ModList（调用 ModParser）
```

## XML 格式（装备 Section）

```xml
<Items activeItemSet="1" useSecondWeaponSet="false">
  <!-- 装备定义 -->
  <Item id="1" variant="1" fabricated="false">
    Rarity: UNIQUE
    Kaom's Heart
    Glorious Plate
    ...（完整游戏文本）
  </Item>

  <Item id="2">
    Rarity: RARE
    Wrath Salvation
    Spike-Point Arrow Quiver
    ...
  </Item>

  <!-- 装备套装（装备槽 → 装备 ID 映射）-->
  <ItemSet id="1" title="">
    <Slot name="Weapon 1" itemId="1"/>
    <Slot name="Helmet" itemId="2"/>
    <Slot name="Body Armour" itemId="3"/>
    <Slot name="Gloves" itemId="4"/>
    <Slot name="Boots" itemId="5"/>
    <Slot name="Amulet" itemId="6"/>
    <Slot name="Ring 1" itemId="7"/>
    <Slot name="Ring 2" itemId="8"/>
    <Slot name="Belt" itemId="9"/>
    <Slot name="Flask 1" itemId="10"/>
    ...
    <Slot name="Jewel 1" itemId="11" nodeId="12345"/>  <!-- 宝珠含节点 ID -->
  </ItemSet>
</Items>
```

## 词缀类型标记

装备词缀行有以下类型标记（`lineFlags`）：

| 标记 | 说明 |
|------|------|
| `implicit` | 隐式词缀（装备基础属性） |
| `explicit` | 显式词缀（前缀/后缀） |
| `crafted` | 工艺台制作词缀 |
| `enchant` | 附魔（迷宫附魔等） |
| `fractured` | 碎裂词缀 |
| `scourge` | 天灾词缀 |
| `synthesis` | 合成词缀 |
| `crucible` | 坩埚词缀 |
| `eater` / `exarch` | 来自吞噬者/传授者的词缀 |
| `custom` | POB 自定义词缀 |
| `mutated` | 变异词缀（Affliction）|

## 影响类型（Influences）

```lua
-- influenceInfo 在 ItemTools.lua 中定义
-- 用于装备的来源标记，影响特定词缀的可用性
"Shaper"    -- 塑界者
"Elder"     -- 先驱者
"Crusader"  -- 十字军
"Redeemer"  -- 救赎者
"Hunter"    -- 猎手
"Warlord"   -- 军阀
```

## 装备数据文件规模

| 文件 | 大小 | 说明 |
|------|------|------|
| `src/Data/ModItem.lua` | 3.9 MB | 所有装备可出现的词缀 |
| `src/Data/ModFlask.lua` | 79 KB | 烧瓶词缀 |
| `src/Data/Essence.lua` | 118 KB | 精华词缀 |
| `src/Data/Crucible.lua` | 1 MB | 坩埚词缀 |
| `src/Data/Uniques/` | (多文件) | 各类独特装备 |
| `src/Data/Bases/` | (多文件) | 各类装备基础类型 |
| `src/Data/Gems.lua` | 396 KB | 宝石数据 |

## 装备对比（Web 端优化推荐的核心）

POB 的装备对比使用 `getMiscCalculator` 的 override 机制：

```lua
-- 原始计算结果
local baseOutput = build.calcsTab.mainOutput

-- 模拟换装
local override = { slot = { ["Body Armour"] = candidateItem } }
local miscCalc, _ = calcs.getMiscCalculator(build)
local newOutput = miscCalc(override)

-- 对比关键指标
local dpsDiff = newOutput.CombinedDPS - baseOutput.CombinedDPS
local ehpDiff = newOutput.TotalEHP - baseOutput.TotalEHP
```

这是实现"推荐装备"功能的基础：对每件候选装备调用此逻辑，排序得到最优推荐。

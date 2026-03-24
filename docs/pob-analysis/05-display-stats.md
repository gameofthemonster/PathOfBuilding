# 展示统计数据与警告系统

## displayStats 定义

`src/Modules/BuildDisplayStats.lua` 定义了侧边栏中所有展示的 stat 条目。每个条目是一个表：

```lua
{
    stat      = "TotalDPS",          -- output 表中的 key
    label     = "Hit DPS",           -- 显示标签
    fmt       = ".1f",               -- 格式化字符串
    color     = colorCodes.FIRE,     -- 显示颜色（可选）
    compPercent = true,              -- 是否在对比时显示百分比变化
    lowerIsBetter = false,           -- 是否越低越好（影响对比时的颜色）
    flag      = "attack",            -- 技能标志过滤（只在匹配时显示）
    notFlag   = "skipEffectiveRate", -- 反向标志过滤
    condFunc  = function(v, o) ... end,  -- 动态显示条件
    warnFunc  = function(v, o) ... end,  -- 警告生成函数
    warnColor = true,                -- 触发警告时用红色显示
    pool      = "ManaUnreserved",    -- 关联的资源池（用于超出上限警告）
    overCapStat = "FireResistOverCap",  -- 超上限的 stat key
    hideStat  = true,                -- 仅作为其他 stat 的数据源，不单独显示
    childStat = "Accuracy",          -- 二级 stat（如 output.MainHand.Accuracy）
}
```

## 关键字段说明

### `condFunc(v, o)` - 显示条件
- `v`：当前 stat 的值
- `o`：整个 output 表
- 返回 true 时才显示该行
- 例：`condFunc = function(v,o) return v < o.Mana end`（未保留魔力 < 总魔力时才显示）

### `warnFunc(v, o)` - 警告生成
- 返回字符串则触发警告（添加到 `warnings.lines`）
- 返回 nil/false 则无警告
- 例：
```lua
warnFunc = function(v) return v >= data.misc.DotDpsCap and "Bleed DPS exceeds in game limit" end
warnFunc = function(v,o) return v > o.Dex and "You do not meet the Dexterity requirement..." end
```

### `fmt` - 格式化规则

| 值 | 含义 | 示例输出 |
|----|------|---------|
| `"d"` | 整数 | `1234` |
| `".1f"` | 1位小数 | `1234.5` |
| `".2f"` | 2位小数 | `1234.56` |
| `"d%%"` | 带 % 的整数 | `75%` |
| `".2f%%"` | 带 % 的小数 | `75.32%` |
| `"+d%%"` | 带符号和 % | `+15%` |
| `".2fs"` | 带单位 s（秒）| `1.23s` |
| `".1fm"` | 带单位 m（米）| `2.5m` |

## 警告系统

### 警告来源

POB 的警告来自多个地方，最终汇集到 `build.controls.warnings.lines`（一个以警告文本为 key 的 table）：

**1. displayStats 的 `warnFunc`（BuildDisplayStats.lua）**
```lua
-- 各种超限、不足的警告
"Bleed DPS exceeds in game limit"
"You do not meet the Strength requirement of ..."
"Your unreserved Life is below 1"
"Your unreserved Mana is negative"
```

**2. 资源消耗不足（Build.lua:1654）**
```lua
-- 当 output.ManaCostWarningList 非空时
"You do not have enough Mana to use: Fireball, Flameblast"
-- 类似的：Life, ES, Rage
```

**3. 百分比消耗超出（Build.lua:1664）**
```lua
"You do not have enough Unreserved Mana to use: ..."
"You do not have enough Unreserved life to use: ..."
```

**4. 被动点数超出（Build.lua:886）**
```lua
"You have too many passive points allocated"
"You have too many ascendancy points allocated"
"You have too many secondary ascendancy points allocated"
```

**5. 装备相关（Build.lua:1695）**
```lua
"You are exceeding jewel limit with the jewel ..."
"You have too many gems in your Body Armour slot"
```

**6. 特殊机制警告**
```lua
"You may have too much cast speed or too little cooldown reduction to effectively use Vixen's Curse"
"You have more than one Aspect skill active"
```

### 警告数据结构

```lua
-- build.controls.warnings.lines 是以警告文本为 key 的 table（非数组）
-- 这样可以自动去重（相同警告只出现一次）
local warnings = build.controls.warnings.lines
-- 遍历：
for key, _ in pairs(warnings) do
    print(key)  -- key 就是警告文本
end
```

## 完整 stat 分类

以下是 `displayStats` 中定义的 stat 大类：

### 伤害输出类
- `AverageHit` / `AverageDamage` — 平均命中/伤害
- `Speed` — 攻击/施法速度
- `HitChance` — 命中率
- `PreEffectiveCritChance` / `CritChance` — 暴击率
- `CritMultiplier` — 暴击加成
- `TotalDPS` / `TotalDot` / `WithDotDPS` — 各类 DPS
- `BleedDPS` / `PoisonDPS` / `IgniteDPS` / `ImpaleDPS` — 各 DoT DPS
- `CombinedDPS` — 综合 DPS
- `FullDPS` / `FullDotDPS` — 全技能 DPS
- `AreaOfEffectRadiusMetres` — AOE 半径
- `ManaCost` / `LifeCost` / `ESCost` / `RageCost` — 各类消耗

### 属性类
- `Str` / `Dex` / `Int` / `Omni` — 属性
- `ReqStr` / `ReqDex` / `ReqInt` — 最高需求（含警告）

### 防御类
- `TotalEHP` — 综合有效血量
- `PhysicalMaximumHitTaken` / `Fire/Cold/LightningMaximumHitTaken` — 各类最大承伤
- `Life` / `LifeUnreserved` / `LifeRegenRecovery` / `LifeLeechGainRate` — 生命系列
- `Mana` / `ManaUnreserved` / `ManaRegenRecovery` — 魔力系列
- `EnergyShield` / `EnergyShieldRegenRecovery` — 能量护盾系列
- `Ward` — 守护值
- `Rage` / `RageRegenRecovery` — 怒气系列
- `TotalBuildDegen` / `TotalNetRegen` — 综合回复/衰减
- `Evasion` / `MeleeEvadeChance` — 闪避
- `Armour` / `PhysicalDamageReduction` — 护甲
- `EffectiveBlockChance` / `EffectiveSpellBlockChance` — 格挡
- `AttackDodgeChance` / `SpellDodgeChance` — 闪避率
- `EffectiveSpellSuppressionChance` — 法术压制
- `FireResist` / `ColdResist` / `LightningResist` / `ChaosResist` — 四抗
- `EffectiveMovementSpeedMod` — 移动速度

## 随从 displayStats（minionDisplayStats）

当主技能为随从技能时，展示随从的 stat 而非玩家的 stat：

```lua
local minionDisplayStats = {
    { stat = "AverageDamage", ... },
    { stat = "TotalDPS", ... },
    { stat = "BleedDPS", ... },
    ...
    { stat = "Life", ... },
    { stat = "EnergyShield", ... },
    { stat = "Armour", ... },
    -- 随从的主要抗性、闪避等
}
```

切换条件：`build.calcsTab.mainEnv.minion ~= nil`（检测是否有随从参与计算）。

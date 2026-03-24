# 计算引擎

## 模块组成

计算引擎由 `src/Modules/Calcs.lua` 统一管理，加载以下子模块：

| 子模块 | 文件 | 职责 |
|--------|------|------|
| CalcSetup | `CalcSetup.lua` (81KB) | 初始化计算环境，构建 ModDB |
| CalcPerform | `CalcPerform.lua` (180KB) | 执行全量计算，协调各子计算 |
| CalcOffence | `CalcOffence.lua` (332KB) | 伤害/DPS 计算（最大的单文件）|
| CalcDefence | `CalcDefence.lua` (204KB) | 防御计算（护甲、闪避、抗性等）|
| CalcActiveSkill | `CalcActiveSkill.lua` (36KB) | 单个技能的属性计算 |
| CalcTriggers | `CalcTriggers.lua` (84KB) | 触发机制（CoC、Trap 等）|
| CalcMirages | `CalcMirages.lua` (19KB) | 幻像射手等镜像技能 |
| CalcBreakdown | `CalcBreakdown.lua` (9KB) | 生成计算详情面板数据 |
| CalcTools | `CalcTools.lua` (11KB) | 工具函数（mod 值计算、宝石插值）|

## 计算流水线

### 1. 初始化环境（CalcSetup）

```lua
local env, cachedPlayerDB, cachedEnemyDB, cachedMinionDB = calcs.initEnv(build, mode)
```

`env` 结构：
```lua
env = {
    player = {
        modDB  = ModDB,      -- 玩家词缀数据库
        output = {},         -- 计算输出（填充在 perform 之后）
        mainSkill = ...,     -- 当前主技能
        activeSkillList = {} -- 所有激活技能列表
    },
    minion = {               -- 如果有随从，则存在
        modDB  = ModDB,
        output = {},
        mainSkill = ...
    },
    enemy = {
        modDB  = ModDB,
        output = {}
    },
    build = build,           -- 原始 build 对象
    auxSkillList = {},       -- 辅助技能（光环、诅咒等）
    itemWarnings = {}        -- 装备相关警告
}
```

**CalcSetup 初始化顺序**：
1. `calcs.initModDB(env, modDB)` — 设置角色基础常量（最大抗性上限、充能数等）
2. 加载被动树节点 mod
3. 处理装备词缀（含放大宝石影响）
4. 应用圣杯/宝珠/光环/诅咒/图腾等全局 buff
5. 处理强盗、万神殿选择
6. 确定主技能和所有激活技能列表

### 2. 执行计算（CalcPerform）

```lua
calcs.perform(env)
```

计算后 `env.player.output` 被填充，包含数百个数值型 stat。

### 3. 全技能 DPS（calcs.calcFullDPS）

```lua
local fullDPS = calcs.calcFullDPS(build, "CALCULATOR", override, specEnv)
-- 返回：
-- fullDPS.combinedDPS   -- 所有技能叠加的总 DPS
-- fullDPS.TotalDotDPS   -- 所有 DoT DPS 总和
-- fullDPS.skills[]      -- 各技能的 DPS 条目
--   { name, dps, count, trigger, skillPart }
```

### 4. 节点/装备对比计算器

```lua
-- 节点对比（用于被动树节点的增益计算）
local nodeCalc, baseOutput = calcs.getNodeCalculator(build)
local newOutput = nodeCalc({ node1, node2 })
-- 对比 newOutput 与 baseOutput 可得到节点增益

-- 通用对比（装备、技能石等）
local miscCalc, baseOutput = calcs.getMiscCalculator(build)
local newOutput = miscCalc(override)
```

## output 表关键字段

`build.calcsTab.mainOutput`（即 `env.player.output`）的关键字段：

### 伤害类
```lua
output.AverageDamage      -- 平均伤害
output.TotalDPS           -- Hit DPS
output.TotalDot           -- DoT DPS
output.WithDotDPS         -- DPS + DoT
output.CombinedDPS        -- 综合 DPS（含 DoT、流血、点燃、毒等）
output.FullDPS            -- 全技能 DPS（所有技能叠加）
output.FullDotDPS         -- 全技能 DoT DPS
output.BleedDPS           -- 流血 DPS
output.PoisonDPS          -- 毒 DPS
output.IgniteDPS          -- 点燃 DPS
output.ImpaleDPS          -- 穿刺 DPS
output.Speed              -- 攻击/施法速度
output.CritChance         -- 暴击率（有效）
output.CritMultiplier     -- 暴击伤害加成
output.HitChance          -- 命中率
```

### 防御类
```lua
output.Life               -- 生命值
output.LifeUnreserved     -- 未保留生命
output.Mana               -- 魔力值
output.ManaUnreserved     -- 未保留魔力
output.EnergyShield       -- 能量护盾
output.Evasion            -- 闪避评级
output.Armour             -- 护甲
output.PhysicalDamageReduction  -- 物理伤害减免
output.FireResist / ColdResist / LightningResist / ChaosResist  -- 各抗性
output.EffectiveBlockChance     -- 有效格挡率
output.TotalEHP           -- 综合有效血量
```

### 属性类
```lua
output.Str / output.Dex / output.Int  -- 力量/敏捷/智慧
output.ReqStr / output.ReqDex / output.ReqInt  -- 最高装备/宝石需求
```

### 技能消耗类
```lua
output.ManaCost           -- 魔力消耗
output.LifeCost           -- 生命消耗
output.ESCost             -- 能量护盾消耗
output.ManaHasCost        -- 是否消耗魔力（布尔）
output.LifeHasCost        -- 是否消耗生命（布尔）
```

### 警告标志类
```lua
output.ManaCostWarningList    -- 魔力不足的技能列表
output.LifeCostWarningList    -- 生命不足的技能列表
output.ESCostWarningList      -- 能量护盾不足的技能列表
output.RageCostWarningList    -- 怒气不足的技能列表
output.VixensTooMuchCastSpeedWarn   -- Vixen's Curse 施法速度过快
output.VixenModeNoVixenGlovesWarn   -- Vixen's 模式但无手套
```

## ModDB 系统

`ModDB` 是整个计算引擎的核心数据结构（`src/Classes/ModDB.lua`）。

```lua
modDB:NewMod(name, type, value, source, ...)
-- 示例：
modDB:NewMod("Life", "BASE", 100, "Item|Body Armour")
modDB:NewMod("FireResist", "INC", 40, "Tree|12345")
```

查询 mod 值：
```lua
modDB:Sum("BASE", nil, "Life")  -- 求所有 Life BASE mod 的和
modDB:More(nil, "Damage")       -- 求所有 Damage MORE 的乘积
modDB:Flag(nil, "Condition:Onslaught")  -- 查询布尔条件
```

## 计算环境的 override 机制

`getMiscCalculator` 支持传入 `override` 来模拟"如果装备/节点不同会怎样"：

```lua
-- 模拟替换某件装备
local override = {
    -- 临时覆盖装备槽
    slot = { ["Body Armour"] = newItem }
}
local newOutput = miscCalc(override)
```

这是 Build 优化推荐功能的核心机制：对比替换前后的 output 差异即可量化增益。

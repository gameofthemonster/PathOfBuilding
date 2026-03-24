# 技能石与插槽系统

## 数据结构层级

```
SkillsTab
  └── socketGroupList[]          (技能石插槽组列表)
        └── SocketGroup
              ├── enabled         boolean，是否参与计算
              ├── includeInFullDPS  boolean，是否计入 FullDPS
              ├── label           用户自定义标签
              ├── slot            装备槽名（"Body Armour" 等）
              ├── source          特殊来源（如特定武器技能）
              ├── mainActiveSkill int，主动技能索引
              └── gemList[]       (宝石实例列表)
                    └── GemInstance
                          ├── skillId      技能 ID（对应 Data/Skills/）
                          ├── gemId        宝石 ID（对应 Data/Gems.lua）
                          ├── nameSpec     显示名称
                          ├── level        宝石等级（1-21/23）
                          ├── quality      品质（0-23）
                          ├── qualityId    替代品质类型
                          ├── variantId    变体 ID（觉醒宝石）
                          ├── enabled      boolean
                          ├── enableGlobal1/2  boolean（双效宝石的两个效果）
                          └── count        数量（通常为 1）
```

## 装备槽类型

技能石可以插在以下装备槽：

```lua
local groupSlotDropList = {
    { label = "None" },              -- 无归属（独立计算）
    { slotName = "Weapon 1" },
    { slotName = "Weapon 2" },
    { slotName = "Weapon 1 Swap" },  -- 换装槽
    { slotName = "Weapon 2 Swap" },
    { slotName = "Helmet" },
    { slotName = "Body Armour" },
    { slotName = "Gloves" },
    { slotName = "Boots" },
    { slotName = "Amulet" },
    { slotName = "Ring 1" },
    { slotName = "Ring 2" },
    { slotName = "Ring 3" },
    { slotName = "Belt" },
}
```

## XML 格式（技能石 Section）

```xml
<Skills activeSkillSet="1">
  <SkillSet id="1">
    <!-- 一个技能石插槽组 -->
    <Skill enabled="true"
           includeInFullDPS="false"
           slot="Body Armour"
           mainActiveSkill="1"
           mainActiveSkillCalcs="1"
           label="">
      <!-- 主动技能 -->
      <Gem skillId="SpectralThrow" level="20" quality="20"
           enabled="true" variantId=""/>
      <!-- 辅助宝石 -->
      <Gem skillId="MultistrikeSupportPlus" level="20" quality="20"
           enabled="true"/>
      <Gem skillId="PhysicalToLightningSupport" level="20" quality="20"
           enabled="true"/>
    </Skill>

    <!-- 光环组 -->
    <Skill enabled="true" slot="Helmet" mainActiveSkill="1" label="Auras">
      <Gem skillId="Wrath" level="20" quality="20" enabled="true"/>
      <Gem skillId="Anger" level="20" quality="20" enabled="true"/>
      <Gem skillId="GenerositySupport" level="20" quality="20" enabled="true"/>
    </Skill>
  </SkillSet>
</Skills>
```

## 品质类型（qualityId）

```lua
local alternateGemQualityList = {
    { label = "Default",    type = "Default" },     -- 普通品质
    { label = "Anomalous",  type = "Alternate1" },  -- 异常品质
    { label = "Divergent",  type = "Alternate2" },  -- 分歧品质
    { label = "Phantasmal", type = "Alternate3" },  -- 幻影品质
}
```

## 宝石排序依据（SkillsTab 的宝石推荐排序）

在技能石配置界面，用于根据不同标准排序宝石推荐：

```lua
local sortGemTypeList = {
    { label = "Full DPS",       type = "FullDPS" },
    { label = "Combined DPS",   type = "CombinedDPS" },
    { label = "Hit DPS",        type = "TotalDPS" },
    { label = "Average Hit",    type = "AverageDamage" },
    { label = "DoT DPS",        type = "TotalDot" },
    { label = "Bleed DPS",      type = "BleedDPS" },
    { label = "Ignite DPS",     type = "IgniteDPS" },
    { label = "Poison DPS",     type = "TotalPoisonDPS" },
    { label = "Effective Hit Pool", type = "TotalEHP" },
}
```

## 默认宝石等级配置

```lua
local defaultGemLevelList = {
    { label = "Normal Maximum",      gemLevel = "normalMaximum" },   -- 最高非腐化等级
    { label = "Corrupted Maximum",   gemLevel = "corruptedMaximum" },-- 最高腐化等级
    { label = "Awakened Maximum",    gemLevel = "awakenedMaximum" }, -- 觉醒最高等级
    { label = "Match Character Level", gemLevel = "characterLevel" }, -- 匹配角色等级
    { label = "Level 1",             gemLevel = "levelOne" },        -- 全部 1 级
}
```

## 技能数据文件

技能数据存储在 `src/Data/Skills/` 目录下，以技能大类分文件：

```
src/Data/Skills/
├── act_str.lua       -- 力量系主动技能
├── act_dex.lua       -- 敏捷系主动技能
├── act_int.lua       -- 智慧系主动技能
├── support_str.lua   -- 力量系辅助宝石
├── support_dex.lua   -- 敏捷系辅助宝石
├── support_int.lua   -- 智慧系辅助宝石
└── ...
```

每个技能文件包含：
```lua
skills["Fireball"] = {
    name = "Fireball",
    color = 3,              -- 宝石颜色（1=红/力, 2=绿/敏, 3=蓝/智）
    baseFlags = { ... },    -- 基础标志（projectile, spell, hit 等）
    stats = { ... },        -- 技能 stat 列表
    levels = { ... },       -- 各等级数值表
    parts = { ... },        -- 技能部分（如闪电箭的暴风/单体）
    statMap = { ... },      -- stat → mod 映射
    -- preFuncs（可选）
    preDamageFunc = function(activeSkill, output) ... end,
}
```

## 技能在计算中的路径

```
SkillsTab.socketGroupList
  ↓ CalcSetup.lua
build.data.skills[skillId]     -- 技能基础数据
  ↓
env.player.activeSkillList     -- 所有激活技能
env.player.mainSkill           -- 当前主技能
  ↓ CalcActiveSkill.lua
activeSkill.skillCfg           -- 技能配置（flags, keywordFlags）
activeSkill.skillData          -- 技能计算后的数据
activeSkill.skillModList       -- 技能专属 mod 列表
  ↓ CalcOffence.lua / CalcDefence.lua
env.player.output              -- 最终输出
```

## 支持宝石的应用条件

支持宝石能否作用于主动技能，由以下条件共同决定（`CalcTools.lua`）：

1. **颜色匹配**：支持宝石颜色需与主动技能兼容
2. **SkillType 兼容**：支持宝石的 `canSupport` 列表需包含主动技能的类型
3. **`gem.support == true`**：宝石本身是支持类型
4. **启用状态**：`gemInstance.enabled == true`
5. **等级需求**：`gemData.levelRequirement <= build.characterLevel`（若设为 characterLevel 模式）

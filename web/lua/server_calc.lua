-- web/lua/server_calc.lua
-- 启动前提：
--   cwd = PathOfBuilding/src/
--   LUA_PATH = ../runtime/lua/?.lua;../runtime/lua/?/init.lua
--   LUA_CPATH = ../runtime/lua/?.so  (macOS: lua-utf8.so required)
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

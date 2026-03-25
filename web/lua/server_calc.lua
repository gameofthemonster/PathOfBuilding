-- web/lua/server_calc.lua
-- 启动前提：
--   cwd = PathOfBuilding/src/
--   LUA_PATH = ../runtime/lua/?.lua;../runtime/lua/?/init.lua
--   LUA_CPATH = ../runtime/lua/?.so  (macOS: lua-utf8.so required)
--   CI 环境变量不能为 "true"（否则 ModCache 不加载导致计算错误）

local json = require "dkjson"

-- 将 print() 重定向到 stderr，避免 HeadlessWrapper 的初始化消息
-- ("Loading..." 等) 污染供 JSON 通信使用的 stdout 管道。
local _orig_print = print
print = function(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end
  io.stderr:write(table.concat(parts, "\t") .. "\n")
  io.stderr:flush()
end

-- 一次性加载 POB 引擎（约 1-3 秒）
dofile("HeadlessWrapper.lua")

-- Headless override: 自动接受版本转换，跳过 UI 弹窗（Build:Init 第 101-104 行的版本检查）
-- 若 XML 的 <Build targetVersion> 不等于 liveTargetVersion("3_0")，
-- 原版 loadBuildFromXML 会提前 return 并跳过 calcsTab:BuildOutput()，导致 mainOutput 为 nil
-- 注意：mainObject 是 HeadlessWrapper.lua 的 local，改用全局 main 和 runCallback
function loadBuildFromXML(xmlText, name)
  main:SetMode("BUILD", false, name or "", xmlText, true)  -- convertBuild=true
  runCallback("OnFrame")
end

-- 导出树节点数据到文件（仅首次运行时）
local treeDataPath = "../web/tree-data.json"
local f = io.open(treeDataPath, "r")
local fileEmpty = f == nil or f:read(1) == nil
if f then f:close() end
if fileEmpty then
  -- 用一个最小 XML 触发引擎初始化（使 build.spec.tree 可用）
  local minXml = [[<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="1" className="Scion" ascendClassName="None" targetVersion="3_0"/>
  <Skills/><Tree activeSpec="1"><Spec treeVersion="3_21" classId="0" ascendClassId="0" nodes=""/></Tree>
  <Items/><Config/>
</PathOfBuilding>]]
  local ok, err = pcall(loadBuildFromXML, minXml, "tree_init")
  if ok and build and build.spec and build.spec.tree then
    local nodes = {}
    local tree = build.spec.tree
    for id, node in pairs(tree.nodes) do
      if node.type ~= "class" and node.x and node.y then
        -- Only keep string mods; parsed mod objects may contain non-serializable functions
        local rawMods = {}
        if type(node.mods) == "table" then
          for _, m in ipairs(node.mods) do
            if type(m) == "string" then
              table.insert(rawMods, m)
            end
          end
        end
        -- Collect connected node IDs from node.out (values may be strings or numbers)
        local outIds = {}
        if type(node.out) == "table" then
          for _, oid in pairs(node.out) do
            local n = tonumber(oid)
            if n then
              table.insert(outIds, n)
            end
          end
        end
        -- Extract bare filename from icon path (e.g. "Art/.../passives/Foo.png" → "Foo")
        local iconFile = nil
        if node.icon then
          iconFile = tostring(node.icon):match("([^/]+)%.%a+$")
        end
        table.insert(nodes, {
          id = node.id or id,
          name = node.name or "",
          type = node.type or "normal",
          x = node.x,
          y = node.y,
          mods = rawMods,
          ascendancyName = node.ascendancyName,
          out = outIds,
          icon = iconFile,
        })
      end
    end
    local out = io.open(treeDataPath, "w")
    if out then
      out:write(json.encode(nodes))
      out:close()
      io.stderr:write("[server_calc] tree-data.json written: " .. #nodes .. " nodes\n")
    end
  else
    io.stderr:write("[server_calc] tree init failed: " .. tostring(err) .. "\n")
  end
else
  io.stderr:write("[server_calc] tree-data.json already exists, skipping\n")
end

-- 导出 sprite 贴图数据（仅首次）
local spritesJsonPath = "../web/sprites.json"
local sf = io.open(spritesJsonPath, "r")
local spritesEmpty = sf == nil or sf:read(1) == nil
if sf then sf:close() end
if spritesEmpty then
  local ok_s, spritesLua = pcall(dofile, "TreeData/3_28/sprites.lua")
  if ok_s and spritesLua and spritesLua.sprites then
    local iconInactive = {}
    local iconActive   = {}
    local frames       = {}
    for _, catName in ipairs({"normalInactive", "notableInactive", "keystoneInactive", "masteryInactive"}) do
      local cat = spritesLua.sprites[catName]
      if cat and cat.coords then
        local url = cat.filename
        for iconPath, coord in pairs(cat.coords) do
          local name = iconPath:match("([^/]+)%.%a+$") or iconPath
          iconInactive[name] = {url=url, x=coord.x, y=coord.y, w=coord.w, h=coord.h}
        end
      end
    end
    for _, catName in ipairs({"normalActive", "notableActive", "keystoneActive"}) do
      local cat = spritesLua.sprites[catName]
      if cat and cat.coords then
        local url = cat.filename
        for iconPath, coord in pairs(cat.coords) do
          local name = iconPath:match("([^/]+)%.%a+$") or iconPath
          iconActive[name] = {url=url, x=coord.x, y=coord.y, w=coord.w, h=coord.h}
        end
      end
    end
    local frameCat = spritesLua.sprites.frame
    if frameCat and frameCat.coords then
      local url = frameCat.filename
      for frameName, coord in pairs(frameCat.coords) do
        frames[frameName] = {url=url, x=coord.x, y=coord.y, w=coord.w, h=coord.h}
      end
    end
    local spritesOut = io.open(spritesJsonPath, "w")
    if spritesOut then
      spritesOut:write(json.encode({inactive=iconInactive, active=iconActive, frames=frames}))
      spritesOut:close()
      io.stderr:write("[server_calc] sprites.json written\n")
    end
  else
    io.stderr:write("[server_calc] sprites load failed\n")
  end
else
  io.stderr:write("[server_calc] sprites.json already exists, skipping\n")
end

-- stat key 白名单（只序列化数值字段，避免函数引用等无法 JSON 化的值）
local EXPORT_STATS = {
  -- Offence
  "CombinedDPS", "FullDPS", "TotalDPS", "TotalDot", "FullDotDPS",
  "AverageHit", "AverageDamage", "AverageBurstDamage", "CombinedAvg",
  "SkillDPS", "BleedDPS", "IgniteDPS", "PoisonDPS", "DecayDPS",
  "ImpaleDPS", "WithBleedDPS", "WithIgniteDPS", "WithPoisonDPS", "WithImpaleDPS",
  "PhysicalDPS", "LightningDPS", "ColdDPS", "FireDPS", "ChaosDPS",
  "ElementalDPS", "TotalNonCritDPS", "TotalCritDPS",
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
  -- Hit Damage Range (total)
  "TotalMin", "TotalMax",
  -- Ailments
  "BleedChance", "BleedDuration", "BleedDotMulti",
  "PoisonChance", "PoisonDuration", "PoisonDotMulti",
  "IgniteChance", "IgniteDuration", "IgniteDotMulti", "IgniteChancePerHit",
  "ChillChance", "FreezeChance", "ShockChance",
  "ShockDuration", "ChillDuration", "FreezeDurationMod",
  -- Skill info
  "AreaOfEffectRadiusMetres", "WeaponRangeMetre",
  "StrikeTargets", "ProjectileSpeedMod",
  -- Warcry
  "WarcryCastTime", "WarcryEffectMod",
  -- Misc offence
  "DoubleDamageChance",
  -- Charges
  "EnduranceCharges", "EnduranceChargesMax",
  "FrenzyCharges", "FrenzyChargesMax",
  "PowerCharges", "PowerChargesMax",
  -- Flask
  "FlaskChargeGen", "FlaskEffect",
  -- Regen
  "LifeRegen", "ManaRegen",
  -- Recharge
  "EnergyShieldRechargeDelay",
  -- Block
  "BlockChance", "SpellBlockChance", "SpellSuppressionChance",
  "EffectiveAttackDodgeChance", "EffectiveSpellDodgeChance",
  -- Fortify
  "MaximumFortification",
  -- Misc
  "ActiveMinionLimit", "Devotion", "LootQuantity", "LootRarity",
  "Cooldown", "Duration", "DurationSecondary",
  "AuraDuration", "AuraEffectMod", "CurseEffectMod",
  "Rage", "Spec:LifeInc", "Spec:EnergyShieldInc", "Spec:ManaInc",
  "Spec:ArmourInc", "Spec:EvasionInc",
  -- Leech max rates & on-hit/kill
  "MaxLifeLeechRate", "LifeLeechRate", "LifeOnHit", "LifeOnKill",
  "MaxManaLeechRate", "ManaLeechRate", "ManaOnHit", "ManaOnKill",
  "MaxEnergyShieldLeechRate", "EnergyShieldLeechRate", "EnergyShieldOnHit", "EnergyShieldOnKill",
  -- Elemental ailment effects
  "ScorchChance", "ScorchEffectMod",
  "ChillEffectMod", "BrittleChance", "BrittleEffectMod",
  "ShockEffectMod", "SapChance", "SapEffectMod",
  -- Misc offence
  "KnockbackChance", "CullPercent",
  -- Flask subtypes
  "FlaskChargeOnCritChance", "UtilityFlaskChargeGen", "LifeFlaskChargeGen", "ManaFlaskChargeGen",
  -- Charge durations
  "EnduranceChargesDuration", "FrenzyChargesDuration", "PowerChargesDuration",
  -- Fortification detail
  "MinimumFortification", "FortifyDuration", "FortificationEffect",
  -- Stun & blind avoidance
  "StunAvoidChance", "StunThreshold", "StunDuration",
  "BlindAvoidChance", "CritExtraDamageReduction",
  -- Ailment avoidance
  "ShockAvoidChance", "FreezeAvoidChance", "ChillAvoidChance",
  "IgniteAvoidChance", "BleedAvoidChance", "PoisonAvoidChance", "CurseAvoidChance",
  -- Self ailment duration/effect
  "SelfFreezeDuration", "SelfChillDuration", "SelfShockDuration", "SelfIgniteDuration",
  "SelfBleedDuration", "SelfPoisonDuration",
  "SelfFreezeEffect", "SelfChillEffect", "SelfShockEffect", "SelfIgniteEffect",
  -- Damage Taken (from enemy)
  "totalEnemyDamage", "PhysicalEnemyDamage", "LightningEnemyDamage",
  "ColdEnemyDamage", "FireEnemyDamage", "ChaosEnemyDamage",
  "totalTakenDamage", "PhysicalTakenDamage", "LightningTakenDamage",
  "ColdTakenDamage", "FireTakenDamage", "ChaosTakenDamage",
  -- Damaging Hits
  "PhysicalTakenHitMult", "LightningTakenHitMult", "ColdTakenHitMult",
  "FireTakenHitMult", "ChaosTakenHitMult",
  "totalTakenHit", "PhysicalTakenHit", "LightningTakenHit",
  "ColdTakenHit", "FireTakenHit", "ChaosTakenHit",
  -- EHP details
  "NumberOfDamagingHits", "TotalNumberOfHits", "EHPSurvivalTime",
  "ConfiguredDamageChance", "ConfiguredNotHitChance",
  -- Recoup
  "LifeRecoupRecoveryMax", "LifeRecoupRecoveryAvg",
  "ManaRecoupRecoveryMax", "ManaRecoupRecoveryAvg",
  "EnergyShieldRecoupRecoveryMax", "EnergyShieldRecoupRecoveryAvg",
  "LifeRecoup", "ManaRecoup", "EnergyShieldRecoup",
  -- Resource reserved/recharge
  "LifeReserved", "ManaReserved",
  "EnergyShieldRecharge", "WardRechargeDelay",
  -- Evasion/block overcap
  "EvadeChance", "BlockChanceOverCap", "SpellBlockChanceOverCap",
  "SpellSuppressionEffect",
  -- Armour elemental reductions
  "FireDamageReduction", "ColdDamageReduction",
  "LightningDamageReduction", "ChaosDamageReduction",
  -- Per-element DoT DPS (Skill Damage over Time section)
  "PhysicalDot", "LightningDot", "ColdDot", "FireDot", "ChaosDot", "TotalDotInstance",
  -- Enemy Degens
  "PhysicalEnemyDegen", "LightningEnemyDegen", "ColdEnemyDegen", "FireEnemyDegen", "ChaosEnemyDegen", "TotalDegen",
  "ComprehensiveTotalNetRegen", "ComprehensiveNetLifeRegen", "ComprehensiveNetManaRegen", "ComprehensiveNetEnergyShieldRegen",
  -- Build Degens (Dots & Build Degens section)
  "PhysicalBuildDegen", "LightningBuildDegen", "ColdBuildDegen", "FireBuildDegen", "ChaosBuildDegen",
  -- Dot taken multipliers
  "PhysicalTakenDotMult", "LightningTakenDotMult", "ColdTakenDotMult", "FireTakenDotMult", "ChaosTakenDotMult",
  -- Per-element pool & EHP for DoTs
  "PhysicalTotalPool", "LightningTotalPool", "ColdTotalPool", "FireTotalPool", "ChaosTotalPool",
  "PhysicalDotEHP", "LightningDotEHP", "ColdDotEHP", "FireDotEHP", "ChaosDotEHP",
  -- Hit Taken Over Time (Recoup section)
  "LifeLossLostMax", "LifeLossLostAvg", "netLifeRecoupAndLossLostOverTimeMax", "netLifeRecoupAndLossLostOverTimeAvg",
  -- Tinctures
  "TinctureEffect", "TinctureLimit",
  -- Skill type-specific Stats
  "GemLevel", "GemQuality", "StoredUses",
  "DurationUptime", "DurationSecondaryUptime", "AuraDurationUptime",
  "ManaReservedMod", "LifeReservedMod", "HeraldBuffEffectMod", "SustainableTrauma",
  -- Rage details
  "RageEffect", "MaximumRage", "RageRegenRecovery", "InherentRageLoss", "InherentRageLossDelay",
}

-- 长度前缀协议循环：读 XML → 计算 → 输出 JSON
while true do
  local lenLine = io.read("*l")
  if not lenLine then break end
  local len = tonumber(lenLine)
  if not len then break end

  local xml = io.read(len)
  if not xml then break end

  local ok, result = pcall(function()
    local loadOk, loadErr = pcall(function()
      loadBuildFromXML(xml, "server_request")
    end)
    if not loadOk then
      return json.encode({ error = tostring(loadErr) })
    end

    local output = build.calcsTab and build.calcsTab.mainOutput
    if not output then
      -- 尝试明确调用 BuildOutput，捕获错误
      local ok2, err2 = pcall(function() build.calcsTab:BuildOutput() end)
      if not ok2 then
        return json.encode({ error = "BuildOutput threw: " .. tostring(err2) })
      end
      output = build.calcsTab.mainOutput
      if not output then
        return json.encode({ error = "mainOutput still nil after explicit BuildOutput; mainEnv=" .. tostring(build.calcsTab.mainEnv) })
      end
    end
    local stats = {}
    for _, key in ipairs(EXPORT_STATS) do
      local v = output[key]
      if type(v) == "number" then
        stats[key] = v
      end
    end

    local warnings = {}
    if build.controls and build.controls.warnings and build.controls.warnings.lines then
      for _, msg in ipairs(build.controls.warnings.lines) do
        table.insert(warnings, msg)
      end
    end

    -- Collect text-based breakdown lines from CALCS mode.
    -- breakdown[statKey] is a Lua array of strings like "200 ^8(base)", "x 1.50 ^8(increased/reduced)", "= 300"
    -- We strip the ^N and ^xRRGGBB color escape codes before sending to the frontend.
    local breakdown = {}
    local ok_calcs, calcsEnv = pcall(function()
      return build.calcsTab.calcs.buildOutput(build, "CALCS")
    end)
    -- Extract per-damage-type hit ranges from CALCS mode (only set when env.mode == "CALCS")
    if ok_calcs and calcsEnv and calcsEnv.player and calcsEnv.player.output then
      local CALCS_STAT_KEYS = {
        "PhysicalMin", "PhysicalMax",
        "LightningMin", "LightningMax",
        "ColdMin", "ColdMax",
        "FireMin", "FireMax",
        "ChaosMin", "ChaosMax",
        "PhysicalDPS", "LightningDPS", "ColdDPS", "FireDPS", "ChaosDPS",
        "ElementalDPS",
      }
      for _, key in ipairs(CALCS_STAT_KEYS) do
        local v = calcsEnv.player.output[key]
        if type(v) == "number" then
          stats[key] = v
        end
      end
    end

    if ok_calcs and calcsEnv and calcsEnv.player and calcsEnv.player.breakdown then
      local bd = calcsEnv.player.breakdown
      -- Keys for which we export simple text-line breakdowns (matching EXPORT_STATS keys used in UI)
      local TEXT_BREAKDOWN_KEYS = {
        "Life", "Mana", "EnergyShield", "Ward",
        "Armour", "Evasion",
        "Str", "Dex", "Int",
        "CritChance", "CritMultiplier",
        "FireResist", "ColdResist", "LightningResist", "ChaosResist",
        "NetLifeRegen", "NetManaRegen", "NetEnergyShieldRegen",
        "LifeLeechGainRate", "ManaLeechGainRate", "EnergyShieldLeechGainRate",
        "PhysicalDamageReduction", "AttackDodgeChance", "SpellDodgeChance",
        "EffectiveBlockChance", "EffectiveSpellBlockChance",
      }
      for _, key in ipairs(TEXT_BREAKDOWN_KEYS) do
        local bd_entry = bd[key]
        -- Only export if it's a plain text-line array (array of strings, no nested tables)
        if type(bd_entry) == "table" and #bd_entry > 0 and type(bd_entry[1]) == "string" then
          local lines = {}
          for _, line in ipairs(bd_entry) do
            -- Strip POB color escape codes: ^N (digit) and ^xRRGGBB (7-char hex)
            local clean = line:gsub("%^%x%x%x%x%x%x%x", ""):gsub("%^%d", "")
            -- Trim leading/trailing whitespace
            clean = clean:match("^%s*(.-)%s*$")
            if clean and #clean > 0 then
              table.insert(lines, { label = clean })
            end
          end
          if #lines > 0 then
            breakdown[key] = lines
          end
        end
      end
    end

    return json.encode({ stats = stats, warnings = warnings, breakdown = breakdown })
  end)

  if ok then
    io.write(result .. "\n")
  else
    io.write(json.encode({ error = tostring(result) }) .. "\n")
  end
  io.flush()
end

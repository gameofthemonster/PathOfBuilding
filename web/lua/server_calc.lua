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

-- 导出树节点数据到文件（仅首次运行时）
local treeDataPath = "../web/tree-data.json"
local f = io.open(treeDataPath, "r")
local fileEmpty = f == nil or f:read(1) == nil
if f then f:close() end
if fileEmpty then
  -- 用一个最小 XML 触发引擎初始化（使 build.spec.tree 可用）
  local minXml = [[<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="1" className="Scion" ascendClassName="None"/>
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
        table.insert(nodes, {
          id = node.id or id,
          name = node.name or "",
          type = node.type or "normal",
          x = node.x,
          y = node.y,
          mods = rawMods,
          ascendancyName = node.ascendancyName,
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
  f:close()
  io.stderr:write("[server_calc] tree-data.json already exists, skipping\n")
end

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

  local ok, result = pcall(function()
    local loadOk, loadErr = pcall(function()
      loadBuildFromXML(xml, "server_request")
    end)
    if not loadOk then
      return json.encode({ error = tostring(loadErr) })
    end

    local output = build.calcsTab.mainOutput
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

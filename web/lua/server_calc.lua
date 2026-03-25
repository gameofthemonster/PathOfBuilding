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

-- Load CalcSections pre-renderer module
local calcSectionsRenderer = dofile("../web/lua/calc_sections_renderer.lua")

-- Headless override: 自动接受版本转换，跳过 UI 弹窗（Build:Init 第 101-104 行的版本检查）
-- 若 XML 的 <Build targetVersion> 不等于 liveTargetVersion("3_0")，
-- 原版 loadBuildFromXML 会提前 return 并跳过 calcsTab:BuildOutput()，导致 mainOutput 为 nil
-- 注意：mainObject 是 HeadlessWrapper.lua 的 local，改用全局 main 和 runCallback
function loadBuildFromXML(xmlText, name)
  main:SetMode("BUILD", false, name or "", xmlText, true)  -- convertBuild=true
  runCallback("OnFrame")
end

-- 将 XML 中未知的 treeVersion 替换为 latestTreeVersion，
-- 避免 TreeTab.lua 第 505 行的 early-return（会导致 specList 为空、被动树节点不加载）
local function sanitizeTreeVersion(xmlText)
  return (xmlText:gsub('treeVersion="([^"]*)"', function(ver)
    if not treeVersions[ver] then
      io.stderr:write("[server_calc] unknown treeVersion=" .. ver .. ", replacing with " .. latestTreeVersion .. "\n")
      return 'treeVersion="' .. latestTreeVersion .. '"'
    end
  end))
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
      -- 排除 class 节点、proxy 节点、以及有 parent 的 expansionJewel 内部 socket 占位节点
      -- （这些占位节点由 BuildSubgraph 动态生成，不应出现在静态树中）
      local isInnerClusterSocket = node.expansionJewel and node.expansionJewel.parent
      if node.type ~= "class" and node.x and node.y and not node.isProxy and not isInnerClusterSocket then
        -- node.sd 是节点的显示文本（stat descriptions），node.mods 是解析后对象（含函数，不可序列化）
        local rawMods = {}
        if type(node.sd) == "table" then
          for _, m in ipairs(node.sd) do
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

-- 导出树元数据（仅首次运行时）：groups 坐标、orbit 常量、节点 orbit 数据、line 贴图
local treeMetaPath = "../web/tree-meta.json"
local tmf = io.open(treeMetaPath, "r")
local treeMetaEmpty = tmf == nil or tmf:read(1) == nil
if tmf then tmf:close() end
if treeMetaEmpty then
  -- 复用已初始化的 build（由 tree-data.json 块初始化）
  local ok2, err2 = true, nil
  if not (build and build.spec and build.spec.tree) then
    local minXml2 = [[<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="1" className="Scion" ascendClassName="None" targetVersion="3_0"/>
  <Skills/><Tree activeSpec="1"><Spec treeVersion="3_21" classId="0" ascendClassId="0" nodes=""/></Tree>
  <Items/><Config/>
</PathOfBuilding>]]
    ok2, err2 = pcall(loadBuildFromXML, minXml2, "tree_meta_init")
  end
  if ok2 and build and build.spec and build.spec.tree then
    local tree = build.spec.tree
    -- Groups: id → {x, y, bg, ascendancyName, isAscendancyStart}
    -- bg: 3=large(PSGroupBackground3), 2=medium, 1=small, 0=none
    local groupsData = {}
    for gid, g in pairs(tree.groups or {}) do
      local bg = 0
      if g.oo then
        if g.oo[3] then bg = 3
        elseif g.oo[2] then bg = 2
        elseif g.oo[1] then bg = 1
        end
      end
      groupsData[tostring(gid)] = {
        x = g.x, y = g.y, bg = bg,
        ascendancyName = g.ascendancyName or nil,
        isAscendancyStart = g.isAscendancyStart or nil,
      }
    end
    -- Orbit constants
    local orbitRadii = tree.orbitRadii or {0, 82, 162, 335, 493}
    local skillsPerOrbit = tree.skillsPerOrbit or {1, 6, 12, 12, 40}
    -- Node orbit data: id → {g, o, oidx}
    local nodeOrbit = {}
    for id, node in pairs(tree.nodes or {}) do
      local nid = tostring(node.id or id)
      local g = node.g or node.group
      local o = node.o or node.orbit
      local oidx = node.oidx or node.orbitIndex
      if g ~= nil and o ~= nil and oidx ~= nil then
        nodeOrbit[nid] = {g = g, o = o, oidx = oidx}
      end
    end
    -- Sprites from sprites.lua: line sprites + asset localUrl helper
    local sprVer = latestTreeVersion or "3_28"
    local ok_s, spritesLua2 = pcall(dofile, "TreeData/" .. sprVer .. "/sprites.lua")
    local lineSprites = {}
    if ok_s and spritesLua2 and spritesLua2.sprites then
      local function localUrl(cdnUrl)
        local base = cdnUrl:match("/([^/?]+)%?") or cdnUrl:match("/([^/?]+)$")
        return "/tree-assets/" .. (base or "unknown.png")
      end
      local lineCat = spritesLua2.sprites.line
      if lineCat and lineCat.coords then
        local url = localUrl(lineCat.filename)
        for spriteName, coord in pairs(lineCat.coords) do
          lineSprites[spriteName] = {url=url, x=coord.x, y=coord.y, w=coord.w, h=coord.h}
        end
      end
    end
    local tmOut = io.open(treeMetaPath, "w")
    if tmOut then
      tmOut:write(json.encode({
        groups = groupsData,
        orbitRadii = orbitRadii,
        skillsPerOrbit = skillsPerOrbit,
        nodes = nodeOrbit,
        lineSprites = lineSprites,
      }))
      tmOut:close()
      io.stderr:write("[server_calc] tree-meta.json written\n")
    end
  else
    io.stderr:write("[server_calc] tree-meta init failed: " .. tostring(err2) .. "\n")
  end
else
  io.stderr:write("[server_calc] tree-meta.json already exists, skipping\n")
end

-- 导出 sprite 贴图数据（仅首次）
local spritesJsonPath = "../web/sprites.json"
local sf = io.open(spritesJsonPath, "r")
local spritesEmpty = sf == nil or sf:read(1) == nil
if sf then sf:close() end
if spritesEmpty then
  local sprVer2 = latestTreeVersion or "3_28"
  local ok_s, spritesLua = pcall(dofile, "TreeData/" .. sprVer2 .. "/sprites.lua")
  if ok_s and spritesLua and spritesLua.sprites then
    -- Convert CDN URL to local /tree-assets/ URL
    local function localUrl(cdnUrl)
      local base = cdnUrl:match("/([^/?]+)%?") or cdnUrl:match("/([^/?]+)$")
      return "/tree-assets/" .. (base or "unknown.png")
    end
    -- Extract icon coords (icon path → bare filename as key)
    local function extractIconCat(catNames)
      local result = {}
      for _, catName in ipairs(catNames) do
        local cat = spritesLua.sprites[catName]
        if cat and cat.coords then
          local url = localUrl(cat.filename)
          for iconPath, coord in pairs(cat.coords) do
            local name = iconPath:match("([^/]+)%.%a+$") or iconPath
            result[name] = {url=url, x=coord.x, y=coord.y, w=coord.w, h=coord.h}
          end
        end
      end
      return result
    end
    -- Extract named coords (sprite name as key, unchanged)
    local function extractNamedCat(catName)
      local result = {}
      local cat = spritesLua.sprites[catName]
      if cat and cat.coords then
        local url = localUrl(cat.filename)
        for name, coord in pairs(cat.coords) do
          result[name] = {url=url, x=coord.x, y=coord.y, w=coord.w, h=coord.h}
        end
      end
      return result
    end
    local spritesOut = io.open(spritesJsonPath, "w")
    if spritesOut then
      spritesOut:write(json.encode({
        normalInactive   = extractIconCat({"normalInactive","masteryInactive"}),
        notableInactive  = extractIconCat({"notableInactive"}),
        keystoneInactive = extractIconCat({"keystoneInactive"}),
        normalActive     = extractIconCat({"normalActive"}),
        notableActive    = extractIconCat({"notableActive"}),
        keystoneActive   = extractIconCat({"keystoneActive"}),
        frames      = extractNamedCat("frame"),
        groupBg     = extractNamedCat("groupBackground"),
        ascendancy  = extractNamedCat("ascendancy"),
        background  = extractNamedCat("background"),
        jewel       = extractNamedCat("jewel"),
        jewelRadius = extractNamedCat("jewelRadius"),
      }))
      spritesOut:close()
      io.stderr:write("[server_calc] sprites.json written\n")
    end
  else
    io.stderr:write("[server_calc] sprites load failed\n")
  end
else
  io.stderr:write("[server_calc] sprites.json already exists, skipping\n")
end

-- 导出技能列表数据（仅首次运行时）
local skillsDataPath = "../web/skills-data.json"
local sdf = io.open(skillsDataPath, "r")
local skillsFileEmpty = sdf == nil or sdf:read(1) == nil
if sdf then sdf:close() end
if skillsFileEmpty then
  -- 确保 build 已初始化（复用已有 build，或重新加载 minXml）
  if not (build and build.data and build.data.skills) then
    local minXmlS = [[<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="1" className="Scion" ascendClassName="None" targetVersion="3_0"/>
  <Skills/><Tree activeSpec="1"><Spec treeVersion="3_21" classId="0" ascendClassId="0" nodes=""/></Tree>
  <Items/><Config/>
</PathOfBuilding>]]
    pcall(loadBuildFromXML, minXmlS, "skills_init")
  end
  local ok_s, err_s = pcall(function()
    if not (build and build.data and build.data.skills) then
      error("build.data.skills not available")
    end
    local skillsList = {}
    for skillId, skillData in pairs(build.data.skills) do
      if type(skillData) == "table" and skillData.name then
        table.insert(skillsList, {
          skillId = skillId,
          name    = skillData.name,
          color   = skillData.color or 0,
        })
      end
    end
    table.sort(skillsList, function(a, b) return a.name < b.name end)
    local sdout = io.open(skillsDataPath, "w")
    if sdout then
      sdout:write(json.encode(skillsList))
      sdout:close()
      io.stderr:write("[server_calc] skills-data.json written: " .. #skillsList .. " skills\n")
    else
      error("cannot open skills-data.json for writing")
    end
  end)
  if not ok_s then
    io.stderr:write("[server_calc] skills export failed: " .. tostring(err_s) .. "\n")
  end
else
  io.stderr:write("[server_calc] skills-data.json already exists, skipping\n")
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
  -- Hit Damage Range (total and per type)
  "TotalMin", "TotalMax",
  "PhysicalMin", "PhysicalMax",
  "LightningMin", "LightningMax",
  "ColdMin", "ColdMax",
  "FireMin", "FireMax",
  "ChaosMin", "ChaosMax",
  -- Accuracy value
  "Accuracy",
  -- Attack/cast time
  "AttackTime", "CastTime",
  -- Gem level/quality
  "GemLevel", "GemQuality",
  -- Ignite detail
  "MaxIgniteStacks",
  -- Skill info extras
  "SplitCount", "CurseLimit",
  -- Mana reservation totals
  "ManaReserved", "LifeReserved",
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

-- 提取 POB colorCodes 颜色码中的 hex 值（如 "^xE05030" → "E05030"）
local function extractColorHex(colorStr)
  if type(colorStr) ~= "string" then return nil end
  return colorStr:match("^%^x([0-9A-Fa-f]+)$")
end

-- matchFlagsLocal：镜像 Build.lua 中的 matchFlags，用于 displayStats 评估
local function matchFlagsLocal(reqFlags, notFlags, flags)
  if type(reqFlags) == "string" then reqFlags = {reqFlags} end
  if reqFlags then
    for _, flag in ipairs(reqFlags) do
      if not flags[flag] then return nil end
    end
  end
  if type(notFlags) == "string" then notFlags = {notFlags} end
  if notFlags then
    for _, flag in ipairs(notFlags) do
      if flags[flag] then return nil end
    end
  end
  return true
end

-- 长度前缀协议循环：读 XML → 计算 → 输出 JSON
while true do
  local lenLine = io.read("*l")
  if not lenLine then break end
  local len = tonumber(lenLine)
  if not len then break end

  local xml = io.read(len)
  if not xml then break end

  xml = sanitizeTreeVersion(xml)

  local ok, result = pcall(function()
    local loadOk, loadErr = pcall(function()
      loadBuildFromXML(xml, "server_request")
    end)
    if not loadOk then
      return json.encode({ error = tostring(loadErr) })
    end

    -- 确保 mainOutput 已计算（作为后备）
    if not (build.calcsTab and build.calcsTab.mainOutput) then
      local ok2, err2 = pcall(function() build.calcsTab:BuildOutput() end)
      if not ok2 then
        return json.encode({ error = "BuildOutput threw: " .. tostring(err2) })
      end
      if not build.calcsTab.mainOutput then
        return json.encode({ error = "mainOutput still nil after explicit BuildOutput; mainEnv=" .. tostring(build.calcsTab.mainEnv) })
      end
    end

    -- 同步 CALCS 模式所需的 input：
    -- 1. skill_number → build.mainSocketGroup（选定哪个 socket group）
    -- 2. mainActiveSkillCalcs → mainActiveSkill（选定 group 内哪个 active skill）
    --    CalcSetup.lua:1698 中 CALCS 模式用 mainActiveSkillCalcs，默认为 1，
    --    而 MAIN 模式用 mainActiveSkill（从 XML 读取）。不同步会导致 CALCS 算错技能。
    if build.calcsTab and build.calcsTab.input then
      build.calcsTab.input.skill_number = build.mainSocketGroup or 1
    end
    local activeSocketGroup = build.skillsTab.socketGroupList[build.mainSocketGroup or 1]
    if activeSocketGroup then
      activeSocketGroup.mainActiveSkillCalcs = activeSocketGroup.mainActiveSkill or 1
    end
    local ok_calcs, calcsEnv = pcall(function()
      return build.calcsTab.calcs.buildOutput(build, "CALCS")
    end)

    -- 诊断数据收集（通过 warnings 传回前端）
    local debugWarnings = {}
    do
      -- 正确字段：build.itemsTab.items（itemList 不存在）
      local itemCount = 0
      if build.itemsTab and build.itemsTab.items then
        for _ in pairs(build.itemsTab.items) do itemCount = itemCount + 1 end
      end
      -- activeItemSet slots
      local slottedCount = 0
      local slottedDetails = ""
      if build.itemsTab and build.itemsTab.activeItemSet then
        local ais = build.itemsTab.activeItemSet
        for k, v in pairs(ais) do
          if type(v) == "table" and v.selItemId and v.selItemId ~= 0 then
            slottedCount = slottedCount + 1
            slottedDetails = slottedDetails .. k .. "=" .. v.selItemId .. " "
          end
        end
      end
      local activeSetId = build.itemsTab and build.itemsTab.activeItemSetId or "nil"
      local grpCount = build.skillsTab and #build.skillsTab.socketGroupList or 0
      local mainSG = build.mainSocketGroup or 0
      local mainAS = activeSocketGroup and (activeSocketGroup.mainActiveSkill or 0) or 0
      -- 检查被动树节点数
      local allocCount = 0
      if build.spec and build.spec.allocNodes then
        for _ in pairs(build.spec.allocNodes) do allocCount = allocCount + 1 end
      end
      local bLevel = build.characterLevel or 0
      local classId = build.spec and build.spec.curClassId or -1
      local treeVer = build.spec and build.spec.treeVersion or "nil"
      local treeNodeCount = 0
      if build.spec and build.spec.nodes then
        for _ in pairs(build.spec.nodes) do treeNodeCount = treeNodeCount + 1 end
      end
      local subgraphCount = build.spec and build.spec.allocSubgraphNodes and #build.spec.allocSubgraphNodes or 0
      -- 检查 treeTab 和 specList 状态
      local treeTabInfo = "nil"
      if build.treeTab then
        local specCount = build.treeTab.specList and #build.treeTab.specList or -1
        treeTabInfo = "ok specCount=" .. specCount
        local specListInfo = ""
        if build.treeTab.specList then
          for i, sp in ipairs(build.treeTab.specList) do
            local ac = 0
            if sp.allocNodes then for _ in pairs(sp.allocNodes) do ac = ac + 1 end end
            specListInfo = specListInfo .. "spec" .. i .. "=" .. ac .. "/" .. (sp.treeVersion or "?") .. " "
          end
        end
        if specListInfo ~= "" then
          table.insert(debugWarnings, "DBG specList: " .. specListInfo)
        end
      end
      table.insert(debugWarnings, string.format(
        "DBG items=%d slotted=%d mainSG=%d mainAS=%d level=%d class=%d treeVer=%s allocNodes=%d treeNodes=%d subgraph=%d treeTab=%s",
        itemCount, slottedCount, mainSG, mainAS, bLevel, classId, treeVer, allocCount, treeNodeCount, subgraphCount, treeTabInfo
      ))
      local mo = build.calcsTab.mainOutput
      if mo then
        table.insert(debugWarnings, string.format(
          "DBG Life=%s Fire=%s Cold=%s Light=%s Chaos=%s Crit=%s",
          tostring(mo.Life), tostring(mo.FireResist), tostring(mo.ColdResist),
          tostring(mo.LightningResist), tostring(mo.ChaosResist), tostring(mo.CritChance)
        ))
      end
    end

    -- EXPORT_STATS：直接使用 MAIN 模式的 mainOutput（与 POB 桌面侧边栏一致）。
    -- OnFrame 时 Build:BuildOutput() 已用正确的 mainActiveSkill 和 mainSocketGroup 计算好。
    local stats = {}
    local mainOut = build.calcsTab.mainOutput
    if mainOut then
      for _, key in ipairs(EXPORT_STATS) do
        local v = mainOut[key]
        if type(v) == "number" then
          stats[key] = v
        end
      end
    end

    local warnings = {}
    for _, msg in ipairs(debugWarnings) do
      table.insert(warnings, msg)
    end
    if build.controls and build.controls.warnings and build.controls.warnings.lines then
      for _, msg in ipairs(build.controls.warnings.lines) do
        table.insert(warnings, msg)
      end
    end

    -- Collect text-based breakdown lines from CALCS mode.
    -- breakdown[statKey] is a Lua array of strings like "200 ^8(base)", "x 1.50 ^8(increased/reduced)", "= 300"
    -- We strip the ^N and ^xRRGGBB color escape codes before sending to the frontend.
    local breakdown = {}

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
        if type(bd_entry) == "table" then
          local lines = {}
          -- Text lines (array of strings): base/multiplier/total chain
          if #bd_entry > 0 and type(bd_entry[1]) == "string" then
            for _, line in ipairs(bd_entry) do
              -- Strip POB color escape codes: ^N (digit) and ^xRRGGBB (7-char hex)
              local clean = line:gsub("%^%x%x%x%x%x%x%x", ""):gsub("%^%d", "")
              clean = clean:match("^%s*(.-)%s*$")
              if clean and #clean > 0 then
                table.insert(lines, { label = clean })
              end
            end
          end
          -- Slot lines: per-equipment/source contribution
          if type(bd_entry.slots) == "table" then
            for _, slot in ipairs(bd_entry.slots) do
              local item = slot.item
              local sname = slot.sourceName
                or (item and ((item.name ~= "" and item.name) or item.base or ""))
                or ""
              table.insert(lines, {
                base = tostring(slot.base or ""),
                inc = slot.inc,
                more = slot.more,
                total = slot.total or "",
                source = slot.source or "",
                sourceName = sname,
              })
            end
          end
          if #lines > 0 then
            breakdown[key] = lines
          end
        end
      end
    end

    -- Pre-render CalcSections section tree
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

    -- Skill parts (calculation variants) for the current main active skill
    local skillParts = {}
    local skillPartIndex = 1
    local skillPartGemGroupIndex = build.mainSocketGroup - 1  -- 0-indexed for frontend
    local skillPartGemIndex = 0
    local mainSocketGroup = build.skillsTab.socketGroupList[build.mainSocketGroup]
    if mainSocketGroup and mainSocketGroup.displaySkillList then
      local mainActiveSkill = mainSocketGroup.mainActiveSkill or 1
      local activeSkill = mainSocketGroup.displaySkillList[mainActiveSkill]
      if activeSkill and activeSkill.activeEffect then
        local grantedEffect = activeSkill.activeEffect.grantedEffect
        if grantedEffect and grantedEffect.parts and #grantedEffect.parts > 1 then
          for _, part in ipairs(grantedEffect.parts) do
            table.insert(skillParts, part.name)
          end
        end
        local srcInstance = activeSkill.activeEffect.srcInstance
        if srcInstance then
          skillPartIndex = srcInstance.skillPart or 1
          for i, gem in ipairs(mainSocketGroup.gemList or {}) do
            if gem == srcInstance then
              skillPartGemIndex = i - 1  -- 0-indexed for frontend
              break
            end
          end
        end
      end
    end

    -- 收集星团珠宝子图节点（id >= 0x10000 的 Notable/Normal 节点，以及
    -- id < 0x10000 但 expansionJewel 已设置的内部 Socket 节点，均由 PassiveSpec:BuildSubgraph 重新定位）
    local clusterNodes = {}
    if build.spec then
      for _, node in pairs(build.spec.nodes or {}) do
        local nid = tonumber(node.id) or 0
        local isClusterSocket = nid < 0x10000 and node.expansionJewel and node.expansionJewel.parent and node.type == "Socket"
        if (nid >= 0x10000 or isClusterSocket) and node.x and node.y then
          local rawMods = {}
          if type(node.sd) == "table" then
            for _, m in ipairs(node.sd) do
              if type(m) == "string" then table.insert(rawMods, m) end
            end
          end
          -- node.linked 是对象数组，提取各自的 id 作为 out
          local outIds = {}
          if type(node.linked) == "table" then
            for _, linked in ipairs(node.linked) do
              local oid = linked.id
              if oid then table.insert(outIds, oid) end
            end
          end
          local iconFile = nil
          if node.icon then
            iconFile = tostring(node.icon):match("([^/]+)%.%a+$")
          end
          table.insert(clusterNodes, {
            id = nid,
            name = node.dn or node.name or "",
            type = node.type or "Normal",
            x = node.x,
            y = node.y,
            mods = rawMods,
            out = outIds,
            icon = iconFile,
          })
        end
      end
    end

    io.stderr:write("[server_calc] clusterNodes count: " .. #clusterNodes .. "\n")
    for i, cn in ipairs(clusterNodes) do
      io.stderr:write(string.format("  [%d] id=%s type=%s name=%s x=%.0f y=%.0f\n", i, tostring(cn.id), tostring(cn.type), tostring(cn.name), cn.x or 0, cn.y or 0))
    end
    -- 调试：jewels/sockets 信息发到前端 warnings
    if build.spec and build.spec.jewels then
      local jewelCount = 0
      local jewelStr = ""
      for nodeId, itemId in pairs(build.spec.jewels) do
        jewelCount = jewelCount + 1
        local item = build.itemsTab and build.itemsTab.items and build.itemsTab.items[itemId]
        local jValid = item and item.jewelData and item.jewelData.clusterJewelValid
        jewelStr = jewelStr .. nodeId .. "→" .. itemId .. (jValid and "[CJ]" or "[X]") .. " "
      end
      table.insert(debugWarnings, "DBG jewels=" .. jewelCount .. ": " .. jewelStr)
    else
      table.insert(debugWarnings, "DBG jewels=nil")
    end
    if build.spec and build.spec.tree and build.spec.tree.sockets then
      local sockCount = 0
      local sockStr = ""
      for nodeId, _ in pairs(build.spec.tree.sockets) do
        sockCount = sockCount + 1
        if sockCount <= 8 then sockStr = sockStr .. tostring(nodeId) .. " " end
      end
      table.insert(debugWarnings, "DBG treeSocks=" .. sockCount .. ": " .. sockStr)
    else
      table.insert(debugWarnings, "DBG treeSocks=nil")
    end
    local highIdCount = 0
    if build.spec and build.spec.nodes then
      for _, node in pairs(build.spec.nodes) do
        local numId = tonumber(node.id) or 0
        if numId >= 0x10000 then highIdCount = highIdCount + 1 end
      end
    end
    table.insert(debugWarnings, "DBG highNodes=" .. highIdCount)

    -- 使用 POB 的 BuildDisplayStats 评估 displayStats
    -- 使用 mainEnv（MAIN 模式）以与 POB 桌面侧边栏完全一致。
    -- 若 mainEnv 不可用则回退到 calcsEnv。
    local displayStatsResult = {}
    local displayActor = (build.calcsTab.mainEnv and build.calcsTab.mainEnv.player) or
                         (ok_calcs and calcsEnv and calcsEnv.player)
    if displayActor and displayActor.mainSkill and displayActor.mainSkill.skillFlags and displayActor.output then
      local skillFlags = displayActor.mainSkill.skillFlags
      local output = displayActor.output
      for _, statData in ipairs(build.displayStats or {}) do
        if not statData.stat then
          -- 空条目 = 分隔符（避免连续重复）
          if #displayStatsResult > 0 and not displayStatsResult[#displayStatsResult].separator then
            table.insert(displayStatsResult, {separator = true})
          end
        elseif not statData.hideStat and matchFlagsLocal(statData.flag, statData.notFlag, skillFlags) then
          local statVal = output[statData.stat]
          -- childStat: 嵌套输出值（如 output.MainHand.Accuracy）
          if statVal ~= nil and statData.childStat then
            statVal = type(statVal) == "table" and statVal[statData.childStat] or nil
          end
          if type(statVal) == "number" then
            local show = false
            if statData.condFunc then
              local ok2, res = pcall(statData.condFunc, statVal, output)
              show = ok2 and res or false
            else
              show = statVal ~= 0
            end
            if show then
              -- 镜像 Build.lua FormatStat 的 pc/mod 变换
              local val = statVal * ((statData.pc or statData.mod) and 100 or 1) - (statData.mod and 100 or 0)
              table.insert(displayStatsResult, {
                stat = statData.stat,
                label = statData.label,
                value = val,
                fmt = statData.fmt,
                color = extractColorHex(statData.color),
              })
            end
          end
        end
      end
      -- 去掉末尾的分隔符
      while #displayStatsResult > 0 and displayStatsResult[#displayStatsResult].separator do
        table.remove(displayStatsResult)
      end
    end

    -- 序列化 buildConfig（由 Lua 权威解析，替代 TypeScript xml-parser.ts）
    local bcSkills = {}
    if build.skillsTab and build.skillsTab.socketGroupList then
      for _, grp in ipairs(build.skillsTab.socketGroupList) do
        local bcGems = {}
        for _, gem in ipairs(grp.gemList or {}) do
          table.insert(bcGems, {
            skillId   = gem.skillId or "",
            gemId     = gem.gemId or "",
            nameSpec  = gem.nameSpec or "",
            level     = gem.level or 20,
            quality   = gem.quality or 0,
            qualityId = type(gem.qualityId) == "string" and gem.qualityId or "Default",
            enabled   = gem.enabled ~= false,
          })
        end
        table.insert(bcSkills, {
          enabled         = grp.enabled ~= false,
          label           = grp.label or "",
          slot            = grp.slot or "",
          mainActiveSkill = grp.mainActiveSkill or 1,
          gems            = bcGems,
        })
      end
    end

    local bcItemList = {}
    local bcSlots    = {}
    if build.itemsTab then
      if build.itemsTab.items then
        for _, item in pairs(build.itemsTab.items) do
          if type(item) == "table" and item.id and item.id > 0 then
            table.insert(bcItemList, {
              id      = item.id,
              rawText = item.raw or "",
              name    = item.name or "",
              base    = item.baseName or "",
              rarity  = item.rarity or "NORMAL",
            })
          end
        end
      end
      if build.itemsTab.activeItemSet then
        for slotName, slot in pairs(build.itemsTab.activeItemSet) do
          if type(slot) == "table" and slot.selItemId and slot.selItemId > 0 then
            bcSlots[slotName] = slot.selItemId
          end
        end
      end
    end

    local bcAllocNodes = {}
    local bcJewels     = {}
    if build.spec then
      for nodeId, val in pairs(build.spec.allocNodes or {}) do
        if val then table.insert(bcAllocNodes, tonumber(nodeId) or 0) end
      end
      if build.spec.jewels then
        for nodeId, itemId in pairs(build.spec.jewels) do
          bcJewels[tostring(nodeId)] = itemId
        end
      end
    end

    local bcConfig = {}
    if build.calcsTab and build.calcsTab.input then
      for k, v in pairs(build.calcsTab.input) do
        local vt = type(v)
        if vt == "boolean" or vt == "number" or vt == "string" then
          bcConfig[k] = v
        end
      end
    end

    local buildConfigResult = {
      level            = build.characterLevel or 1,
      className        = (build.spec and build.spec.curClassName)       or "Scion",
      ascendClassName  = (build.spec and build.spec.curAscendClassName) or "None",
      mainSocketGroup  = build.mainSocketGroup or 1,
      skills           = bcSkills,
      tree = {
        treeVersion   = (build.spec and build.spec.treeVersion)      or "3_28",
        classId       = (build.spec and build.spec.curClassId)       or 0,
        ascendClassId = (build.spec and build.spec.curAscendClassId) or 0,
        allocNodes    = bcAllocNodes,
        jewels        = next(bcJewels) and bcJewels or nil,
      },
      items = {
        itemList = bcItemList,
        slots    = bcSlots,
      },
      config = bcConfig,
    }

    return json.encode({
      stats = stats, warnings = warnings, breakdown = breakdown,
      displayStats = displayStatsResult,
      skillParts = skillParts, skillPartIndex = skillPartIndex,
      skillPartGemGroupIndex = skillPartGemGroupIndex, skillPartGemIndex = skillPartGemIndex,
      clusterNodes = clusterNodes,
      calcSections = calcSections,
      buildConfig  = buildConfigResult,
    })
  end)

  if ok then
    io.write(result .. "\n")
  else
    io.write(json.encode({ error = tostring(result) }) .. "\n")
  end
  io.flush()
end

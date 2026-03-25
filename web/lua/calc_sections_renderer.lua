-- web/lua/calc_sections_renderer.lua
-- Pre-renders CalcSections into a JSON-serializable structure.
-- Called from server_calc.lua after loadBuildFromXML().
--
-- Returns an array of CalcSection objects matching the TypeScript interface:
--   { id, label, color?, defaultCollapsed, column, subsections:[{label,rows:[{label,value,breakdownKey?,hidden}]}] }
--
-- IMPORTANT: This module must be loadable standalone (for syntax checking) without
-- the POB engine present.  All references to output are guarded with "or 0".

local M = {}

-- ---------------------------------------------------------------------------
-- Number formatting helpers
-- ---------------------------------------------------------------------------

local function fmt_int(n)
  if type(n) ~= "number" then return "0" end
  n = math.floor(n + 0.5)
  local s = tostring(math.abs(n))
  -- Insert thousands separators
  local result = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
  -- Remove leading comma from the reverse trick
  result = result:gsub("^,", "")
  if n < 0 then result = "-" .. result end
  return result
end

local function fmt_dec1(n)
  if type(n) ~= "number" then return "0.0" end
  return string.format("%.1f", n)
end

local function fmt_dec2(n)
  if type(n) ~= "number" then return "0.00" end
  return string.format("%.2f", n)
end

local function fmt_pct(n)
  if type(n) ~= "number" then return "0.0%" end
  return string.format("%.1f%%", n)
end

local function fmt_pct_int(n)
  if type(n) ~= "number" then return "0%" end
  return string.format("%d%%", math.floor(n + 0.5))
end

local function fmt_range(a, b)
  return fmt_int(a) .. " \xe2\x80\x93 " .. fmt_int(b)  -- en-dash
end

local function fmt_mult(n)
  -- "x 1.23" style used for multipliers
  if type(n) ~= "number" then return "x 0.00" end
  return string.format("x %.2f", n)
end

local function fmt_speed(n)
  -- Attacks/casts per second shown as 2 decimals
  if type(n) ~= "number" then return "0.00" end
  return string.format("%.2f", n)
end

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Returns true if key exists in output table and value is non-zero / non-nil
local function have(output, key)
  if type(output) ~= "table" then return false end
  local v = output[key]
  return v ~= nil and v ~= 0 and v ~= false
end

-- Safe get with default 0
local function get(output, key)
  if type(output) ~= "table" then return 0 end
  local v = output[key]
  if type(v) == "number" then return v end
  return 0
end

-- Safe get returning nil (no default)
local function getv(output, key)
  if type(output) ~= "table" then return nil end
  return output[key]
end

-- Row constructor
local function row(label, value, breakdownKey, visible)
  return {
    label = label or "",
    value = tostring(value or ""),
    breakdownKey = breakdownKey or nil,
    hidden = not visible,
  }
end

-- ---------------------------------------------------------------------------
-- Section builder helpers
-- ---------------------------------------------------------------------------

local function make_section(id, label, color, defaultCollapsed, column, subsections)
  return {
    id = id,
    label = label,
    color = color,         -- hex WITHOUT # prefix, or nil
    defaultCollapsed = defaultCollapsed,
    column = column,
    subsections = subsections or {},
  }
end

local function make_subsection(label, rows)
  return { label = label or "", rows = rows or {} }
end

-- ---------------------------------------------------------------------------
-- Color constants (POB colorCodes hex values without #)
-- ---------------------------------------------------------------------------
local COL_OFFENCE  = "E05030"
local COL_DEFENCE  = "8888FF"
local COL_LIFE     = "DD3333"
local COL_MANA     = "8888FF"
local COL_ES       = "AAFFFF"
local COL_WARD     = "C8E4B4"
local COL_ARMOUR   = "CC9966"
local COL_EVASION  = "99FF77"
local COL_NORMAL   = "FFFFFF"
local COL_CRAFTED  = "B8DAF1"
local COL_RAGE     = "FF9922"
local COL_STRENGTH = "DD3333"
local COL_DEX      = "99FF77"
local COL_INT      = "8888FF"

-- ---------------------------------------------------------------------------
-- Main render function
-- ---------------------------------------------------------------------------

function M.renderCalcSections(output)
  if type(output) ~= "table" then return {} end

  local sections = {}

  -- =========================================================================
  -- COLUMN: left-a (Offence primary)
  -- =========================================================================

  -- -------------------------------------------------------------------------
  -- HitDamage
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    local totalMin = get(output, "TotalMin")
    local totalMax = get(output, "TotalMax")
    table.insert(rows, row("Hit Damage (Total)", fmt_range(totalMin, totalMax), "Physical", have(output, "TotalMin")))
    table.insert(rows, row("Physical", fmt_range(get(output,"PhysicalMin"), get(output,"PhysicalMax")), "Physical", have(output,"PhysicalMin")))
    table.insert(rows, row("Lightning", fmt_range(get(output,"LightningMin"), get(output,"LightningMax")), "Lightning", have(output,"LightningMin")))
    table.insert(rows, row("Cold", fmt_range(get(output,"ColdMin"), get(output,"ColdMax")), "Cold", have(output,"ColdMin")))
    table.insert(rows, row("Fire", fmt_range(get(output,"FireMin"), get(output,"FireMax")), "Fire", have(output,"FireMin")))
    table.insert(rows, row("Chaos", fmt_range(get(output,"ChaosMin"), get(output,"ChaosMax")), "Chaos", have(output,"ChaosMin")))
    table.insert(rows, row("Average Hit", fmt_int(get(output,"AverageHit")), "AverageHit", have(output,"AverageHit")))
    table.insert(rows, row("Average Damage", fmt_int(get(output,"AverageDamage")), "AverageDamage", have(output,"AverageDamage")))
    -- Main hand
    local mhMin = get(output,"MainHand.TotalMin")
    local mhMax = get(output,"MainHand.TotalMax")
    table.insert(rows, row("MH Hit Damage", fmt_range(mhMin, mhMax), nil, have(output,"MainHand.TotalMin")))
    table.insert(rows, row("MH Average Hit", fmt_int(get(output,"MainHand.AverageHit")), "MainHand.AverageHit", have(output,"MainHand.AverageHit")))
    -- Off hand
    local ohMin = get(output,"OffHand.TotalMin")
    local ohMax = get(output,"OffHand.TotalMax")
    table.insert(rows, row("OH Hit Damage", fmt_range(ohMin, ohMax), nil, have(output,"OffHand.TotalMin")))
    table.insert(rows, row("OH Average Hit", fmt_int(get(output,"OffHand.AverageHit")), "OffHand.AverageHit", have(output,"OffHand.AverageHit")))

    table.insert(sections, make_section("HitDamage", "Hit Damage Range", COL_OFFENCE, false, "left-a", {
      make_subsection("Skill Hit Damage", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Speed
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Attacks/s", fmt_speed(get(output,"Speed")), "Speed", have(output,"Speed")))
    table.insert(rows, row("MH Att/s", fmt_speed(get(output,"MainHand.Speed")), "MainHand.Speed", have(output,"MainHand.Speed")))
    table.insert(rows, row("OH Att/s", fmt_speed(get(output,"OffHand.Speed")), "OffHand.Speed", have(output,"OffHand.Speed")))
    table.insert(rows, row("Cast Time", fmt_dec2(get(output,"Time")) .. "s", nil, have(output,"Time")))
    table.insert(rows, row("Trigger Rate Cap", fmt_speed(get(output,"TriggerRateCap")), "TriggerRateCap", have(output,"TriggerRateCap")))
    table.insert(rows, row("Skill Trigger Rate", fmt_speed(get(output,"SkillTriggerRate")), "SkillTriggerRate", have(output,"SkillTriggerRate")))
    table.insert(rows, row("Cooldown", fmt_dec2(get(output,"Cooldown")) .. "s", "Cooldown", have(output,"Cooldown")))
    table.insert(rows, row("Hit Rate", fmt_speed(get(output,"HitSpeed")), "HitSpeed", have(output,"HitSpeed")))

    table.insert(sections, make_section("Speed", "Attack/Cast Rate", COL_OFFENCE, false, "left-a", {
      make_subsection("Attack/Cast Rate", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Crit
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Crit Chance", fmt_pct(get(output,"CritChance")), "CritChance", have(output,"CritChance")))
    table.insert(rows, row("Crit Multiplier", fmt_mult(get(output,"CritMultiplier")), "CritMultiplier", have(output,"CritMultiplier")))
    table.insert(rows, row("Crit Effect Mod", fmt_mult(get(output,"CritEffect")), "CritEffect", have(output,"CritEffect")))
    table.insert(rows, row("MH Crit Chance", fmt_pct(get(output,"MainHand.CritChance")), "MainHand.CritChance", have(output,"MainHand.CritChance")))
    table.insert(rows, row("MH Crit Mult", fmt_mult(get(output,"MainHand.CritMultiplier")), "MainHand.CritMultiplier", have(output,"MainHand.CritMultiplier")))
    table.insert(rows, row("OH Crit Chance", fmt_pct(get(output,"OffHand.CritChance")), "OffHand.CritChance", have(output,"OffHand.CritChance")))
    table.insert(rows, row("OH Crit Mult", fmt_mult(get(output,"OffHand.CritMultiplier")), "OffHand.CritMultiplier", have(output,"OffHand.CritMultiplier")))

    table.insert(sections, make_section("Crit", "Crits", COL_OFFENCE, false, "left-a", {
      make_subsection("Crits", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- HitChance (Accuracy)
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("MH Accuracy", fmt_int(get(output,"MainHand.Accuracy")), "MainHand.Accuracy", have(output,"MainHand.Accuracy")))
    table.insert(rows, row("MH Hit Chance", fmt_pct_int(get(output,"MainHand.HitChance")), "MainHand.HitChance", have(output,"MainHand.HitChance")))
    table.insert(rows, row("MH Acc. Hit Chance", fmt_pct_int(get(output,"MainHand.AccuracyHitChance")), "MainHand.AccuracyHitChance", have(output,"MainHand.AccuracyHitChance")))
    table.insert(rows, row("OH Accuracy", fmt_int(get(output,"OffHand.Accuracy")), "OffHand.Accuracy", have(output,"OffHand.Accuracy")))
    table.insert(rows, row("OH Hit Chance", fmt_pct_int(get(output,"OffHand.HitChance")), "OffHand.HitChance", have(output,"OffHand.HitChance")))

    table.insert(sections, make_section("HitChance", "Accuracy", COL_OFFENCE, false, "left-a", {
      make_subsection("Accuracy", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- SkillTypeStats
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Gem Level", tostring(math.floor(get(output,"GemLevel")+0.5)), "GemLevel", have(output,"GemHasLevel")))
    table.insert(rows, row("Gem Quality", tostring(math.floor(get(output,"GemQuality")+0.5)), "GemQuality", have(output,"GemHasQuality")))
    table.insert(rows, row("Skill Duration", fmt_dec2(get(output,"Duration")) .. "s", "Duration", have(output,"Duration")))
    table.insert(rows, row("Secondary Duration", fmt_dec2(get(output,"DurationSecondary")) .. "s", "DurationSecondary", have(output,"DurationSecondary")))
    table.insert(rows, row("Skill Cooldown", fmt_dec2(get(output,"Cooldown")) .. "s", "Cooldown", have(output,"Cooldown")))
    table.insert(rows, row("Projectile Count", tostring(math.floor(get(output,"ProjectileCount")+0.5)), "ProjectileCount", have(output,"ProjectileCount")))
    table.insert(rows, row("Area of Effect", fmt_mult(get(output,"AreaOfEffectMod")), "AreaOfEffectMod", have(output,"AreaOfEffectMod")))
    table.insert(rows, row("Radius", fmt_dec1(get(output,"AreaOfEffectRadiusMetres")) .. "m", "AreaOfEffectRadius", have(output,"AreaOfEffectRadiusMetres")))
    table.insert(rows, row("Active Minion Limit", tostring(math.floor(get(output,"ActiveMinionLimit")+0.5)), nil, have(output,"ActiveMinionLimit")))
    table.insert(rows, row("Totem Life", fmt_int(get(output,"TotemLife")), "TotemLife", have(output,"TotemLife")))
    table.insert(rows, row("Active Totem Limit", tostring(math.floor(get(output,"ActiveTotemLimit")+0.5)), "ActiveTotemLimit", have(output,"ActiveTotemLimit")))
    table.insert(rows, row("Active Trap Limit", tostring(math.floor(get(output,"ActiveTrapLimit")+0.5)), nil, have(output,"ActiveTrapLimit")))
    table.insert(rows, row("Active Mine Limit", tostring(math.floor(get(output,"ActiveMineLimit")+0.5)), nil, have(output,"ActiveMineLimit")))
    table.insert(rows, row("Repeat Count", tostring(math.floor(get(output,"RepeatCount")+0.5)), nil, have(output,"RepeatCount")))
    table.insert(rows, row("DPS Multiplier", fmt_dec2(get(output,"SkillDPSMultiplier")), "SkillDPSMultiplier", have(output,"SkillDPSMultiplier")))
    table.insert(rows, row("Mana Cost", fmt_int(get(output,"ManaCost")), "ManaCost", have(output,"ManaHasCost")))
    table.insert(rows, row("Mana %/s Cost", fmt_dec2(get(output,"ManaPercentPerSecondCost")) .. "%", "ManaPercentPerSecondCost", have(output,"ManaPercentPerSecondHasCost")))
    table.insert(rows, row("Life Cost", fmt_int(get(output,"LifeCost")), "LifeCost", have(output,"LifeHasCost")))
    table.insert(rows, row("ES Cost", fmt_int(get(output,"ESCost")), "ESCost", have(output,"ESHasCost")))
    table.insert(rows, row("Rage Cost", fmt_int(get(output,"RageCost")), "RageCost", have(output,"RageHasCost")))
    table.insert(rows, row("Soul Cost", fmt_int(get(output,"SoulCost")), "SoulCost", have(output,"SoulHasCost")))
    table.insert(rows, row("Mana Reserved", fmt_int(get(output,"ManaReserved")), "ManaReserved", have(output,"ManaReservedMod")))
    table.insert(rows, row("Life Reserved", fmt_int(get(output,"LifeReserved")), "LifeReserved", have(output,"LifeReservedMod")))

    table.insert(sections, make_section("SkillTypeStats", "Skill Type-Specific Stats", COL_OFFENCE, false, "left-a", {
      make_subsection("Skill Stats", rows)
    }))
  end

  -- =========================================================================
  -- COLUMN: left-b (Offence secondary / ailments)
  -- =========================================================================

  -- -------------------------------------------------------------------------
  -- Dot
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total DoT DPS", fmt_int(get(output,"TotalDotCalcSection")), "TotalDot", have(output,"TotalDotCalcSection")))
    table.insert(rows, row("Total DoT Instance", fmt_int(get(output,"TotalDotInstance")), nil, have(output,"TotalDotInstance")))
    table.insert(rows, row("Physical DoT", fmt_int(get(output,"PhysicalDot")), "PhysicalDot", have(output,"PhysicalDot")))
    table.insert(rows, row("Lightning DoT", fmt_int(get(output,"LightningDot")), "LightningDot", have(output,"LightningDot")))
    table.insert(rows, row("Cold DoT", fmt_int(get(output,"ColdDot")), "ColdDot", have(output,"ColdDot")))
    table.insert(rows, row("Fire DoT", fmt_int(get(output,"FireDot")), "FireDot", have(output,"FireDot")))
    table.insert(rows, row("Chaos DoT", fmt_int(get(output,"ChaosDot")), "ChaosDot", have(output,"ChaosDot")))

    table.insert(sections, make_section("Dot", "Damage over Time", COL_OFFENCE, false, "left-b", {
      make_subsection("Skill Damage over Time", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Bleed
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Bleed Chance", fmt_pct_int(get(output,"BleedChance")), "BleedChance", have(output,"BleedChance")))
    table.insert(rows, row("Bleed DPS", fmt_int(get(output,"BleedDPS")), "BleedDPS", have(output,"BleedDPS")))
    table.insert(rows, row("Bleed Duration", fmt_dec2(get(output,"BleedDuration")) .. "s", "BleedDuration", have(output,"BleedDuration")))
    table.insert(rows, row("Max Bleed Stacks", tostring(math.floor(get(output,"BleedStacksMax")+0.5)), nil, have(output,"BleedStacksMax")))
    table.insert(rows, row("MH Bleed DPS", fmt_int(get(output,"MainHand.BleedDPS")), "MainHand.BleedDPS", have(output,"MainHand.BleedDPS")))
    table.insert(rows, row("OH Bleed DPS", fmt_int(get(output,"OffHand.BleedDPS")), "OffHand.BleedDPS", have(output,"OffHand.BleedDPS")))

    table.insert(sections, make_section("Bleed", "Bleed", COL_OFFENCE, false, "left-b", {
      make_subsection("Bleed", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Poison
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Poison Chance", fmt_pct_int(get(output,"PoisonChance")), "PoisonChance", have(output,"PoisonChance")))
    table.insert(rows, row("Poison DPS", fmt_int(get(output,"PoisonDPS")), "PoisonDPS", have(output,"PoisonDPS")))
    table.insert(rows, row("Poison Duration", fmt_dec2(get(output,"PoisonDuration")) .. "s", "PoisonDuration", have(output,"PoisonDuration")))
    table.insert(rows, row("Poison Stacks", fmt_dec1(get(output,"PoisonStacks")), "PoisonStacks", have(output,"PoisonStacks")))
    table.insert(rows, row("Dmg per Poison", fmt_int(get(output,"PoisonDamage")), "PoisonDamage", have(output,"PoisonDamage")))
    table.insert(rows, row("Total Poison DPS", fmt_int(get(output,"TotalPoisonDPS")), "TotalPoisonDPS", have(output,"TotalPoisonDPS")))
    table.insert(rows, row("MH Poison DPS", fmt_int(get(output,"MainHand.PoisonDPS")), "MainHand.PoisonDPS", have(output,"MainHand.PoisonDPS")))
    table.insert(rows, row("OH Poison DPS", fmt_int(get(output,"OffHand.PoisonDPS")), "OffHand.PoisonDPS", have(output,"OffHand.PoisonDPS")))

    table.insert(sections, make_section("Poison", "Poison", COL_OFFENCE, false, "left-b", {
      make_subsection("Poison", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Ignite
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Ignite Chance", fmt_pct_int(get(output,"IgniteChancePerHit")), "IgniteChance", have(output,"IgniteChancePerHit")))
    table.insert(rows, row("Ignite DPS", fmt_int(get(output,"IgniteDPS")), "IgniteDPS", have(output,"IgniteDPS")))
    table.insert(rows, row("Ignite Duration", fmt_dec2(get(output,"IgniteDuration")) .. "s", "IgniteDuration", have(output,"IgniteDuration")))
    table.insert(rows, row("Dmg per Ignite", fmt_int(get(output,"IgniteDamage")), "IgniteDamage", have(output,"IgniteDamage")))
    table.insert(rows, row("Max Ignite Stacks", tostring(math.floor(get(output,"IgniteStacksMax")+0.5)), nil, have(output,"IgniteStacksMax")))
    table.insert(rows, row("MH Ignite DPS", fmt_int(get(output,"MainHand.IgniteDPS")), "MainHand.IgniteDPS", have(output,"MainHand.IgniteDPS")))
    table.insert(rows, row("OH Ignite DPS", fmt_int(get(output,"OffHand.IgniteDPS")), "OffHand.IgniteDPS", have(output,"OffHand.IgniteDPS")))

    table.insert(sections, make_section("Ignite", "Ignite", COL_OFFENCE, false, "left-b", {
      make_subsection("Ignite", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Decay
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Decay DPS", fmt_int(get(output,"DecayDPS")), "DecayDPS", have(output,"DecayDPS")))
    table.insert(rows, row("Decay Duration", fmt_dec2(get(output,"DecayDuration")) .. "s", "DecayDuration", have(output,"DecayDuration")))

    table.insert(sections, make_section("Decay", "Decay", COL_OFFENCE, false, "left-b", {
      make_subsection("Decay", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- LeechGain
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Life Leech Cap", fmt_int(get(output,"MaxLifeLeechRate")), "MaxLifeLeechRate", have(output,"MaxLifeLeechRate")))
    table.insert(rows, row("Life Leech Rate", fmt_int(get(output,"LifeLeechRate")), "LifeLeech", have(output,"LifeLeechRate")))
    table.insert(rows, row("Life Gain on Hit", fmt_int(get(output,"LifeOnHit")), nil, have(output,"LifeOnHit")))
    table.insert(rows, row("Life Gain on Kill", fmt_int(get(output,"LifeOnKill")), nil, have(output,"LifeOnKill")))
    table.insert(rows, row("ES Leech Cap", fmt_int(get(output,"MaxEnergyShieldLeechRate")), "MaxEnergyShieldLeechRate", have(output,"MaxEnergyShieldLeechRate")))
    table.insert(rows, row("ES Leech Rate", fmt_int(get(output,"EnergyShieldLeechRate")), "EnergyShieldLeech", have(output,"EnergyShieldLeechRate")))
    table.insert(rows, row("ES Gain on Hit", fmt_int(get(output,"EnergyShieldOnHit")), nil, have(output,"EnergyShieldOnHit")))
    table.insert(rows, row("Mana Leech Cap", fmt_int(get(output,"MaxManaLeechRate")), "MaxManaLeechRate", have(output,"MaxManaLeechRate")))
    table.insert(rows, row("Mana Leech Rate", fmt_int(get(output,"ManaLeechRate")), "ManaLeech", have(output,"ManaLeechRate")))
    table.insert(rows, row("Mana Gain on Hit", fmt_int(get(output,"ManaOnHit")), nil, have(output,"ManaOnHit")))

    table.insert(sections, make_section("LeechGain", "Leech & Gain on Hit", COL_OFFENCE, false, "left-b", {
      make_subsection("Leech & Gain on Hit", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Impale
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Impale Chance", fmt_pct_int(get(output,"ImpaleChance")), nil, have(output,"ImpaleChance")))
    table.insert(rows, row("Impale Stacks", tostring(math.floor(get(output,"ImpaleStacks")+0.5)), nil, have(output,"ImpaleStacks")))
    table.insert(rows, row("Max Impale Stacks", tostring(math.floor(get(output,"ImpaleStacksMax")+0.5)), nil, have(output,"ImpaleStacksMax")))
    table.insert(rows, row("Impale DPS", fmt_int(get(output,"ImpaleDPS")), "ImpaleDPS", have(output,"ImpaleDPS")))
    table.insert(rows, row("Impale Duration", fmt_dec2(get(output,"ImpaleDuration")) .. "s", "ImpaleDuration", have(output,"ImpaleDuration")))
    table.insert(rows, row("MH Impale Chance", fmt_pct_int(get(output,"MainHand.ImpaleChance")), nil, have(output,"MainHand.ImpaleChance")))
    table.insert(rows, row("OH Impale Chance", fmt_pct_int(get(output,"OffHand.ImpaleChance")), nil, have(output,"OffHand.ImpaleChance")))

    table.insert(sections, make_section("Impale", "Impale", COL_OFFENCE, false, "left-b", {
      make_subsection("Impale", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- EleAilments (Non-Damaging Ailments)
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    -- Scorch
    table.insert(rows, row("Scorch Chance", fmt_pct_int(get(output,"ScorchChance")), nil, have(output,"ScorchChance")))
    table.insert(rows, row("Scorch Effect", fmt_mult(get(output,"ScorchEffectMod")), "ScorchEffectMod", have(output,"ScorchEffectMod")))
    table.insert(rows, row("Scorch Duration", fmt_dec2(get(output,"ScorchDuration")) .. "s", nil, have(output,"ScorchDuration")))
    -- Chill
    table.insert(rows, row("Chill Chance", fmt_pct_int(get(output,"ChillChance")), nil, have(output,"ChillChance")))
    table.insert(rows, row("Chill Effect", fmt_mult(get(output,"ChillEffectMod")), "ChillEffectMod", have(output,"ChillEffectMod")))
    table.insert(rows, row("Chill Duration", fmt_dec2(get(output,"ChillDuration")) .. "s", nil, have(output,"ChillDuration")))
    -- Freeze
    table.insert(rows, row("Freeze Chance", fmt_pct_int(get(output,"FreezeChance")), nil, have(output,"FreezeChance")))
    table.insert(rows, row("Freeze Dur Mod", fmt_mult(get(output,"FreezeDurationMod")), "FreezeDurationMod", have(output,"FreezeDurationMod")))
    -- Shock
    table.insert(rows, row("Shock Chance", fmt_pct_int(get(output,"ShockChance")), nil, have(output,"ShockChance")))
    table.insert(rows, row("Shock Effect", fmt_mult(get(output,"ShockEffectMod")), "ShockEffectMod", have(output,"ShockEffectMod")))
    table.insert(rows, row("Shock Duration", fmt_dec2(get(output,"ShockDuration")) .. "s", nil, have(output,"ShockDuration")))
    table.insert(rows, row("Current Shock", fmt_pct_int(get(output,"CurrentShock")), nil, have(output,"CurrentShock")))
    -- Brittle
    table.insert(rows, row("Brittle Chance", fmt_pct_int(get(output,"BrittleChance")), nil, have(output,"BrittleChance")))
    table.insert(rows, row("Brittle Effect", fmt_mult(get(output,"BrittleEffectMod")), "BrittleEffectMod", have(output,"BrittleEffectMod")))
    -- Sap
    table.insert(rows, row("Sap Chance", fmt_pct_int(get(output,"SapChance")), nil, have(output,"SapChance")))
    table.insert(rows, row("Sap Effect", fmt_mult(get(output,"SapEffectMod")), "SapEffectMod", have(output,"SapEffectMod")))

    table.insert(sections, make_section("EleAilments", "Non-Damaging Ailments", COL_OFFENCE, false, "left-b", {
      make_subsection("Non-Damaging Ailments", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- MiscEffects (Other Effects)
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Knockback Chance", fmt_pct_int(get(output,"KnockbackChance")), nil, have(output,"KnockbackChance")))
    table.insert(rows, row("Knockback Dist.", tostring(math.floor(get(output,"KnockbackDistance")+0.5)), "KnockbackDistance", have(output,"KnockbackDistance")))
    table.insert(rows, row("Cull Strike %", fmt_pct_int(get(output,"CullPercent")), nil, have(output,"CullPercent")))
    table.insert(rows, row("Enemy Stun Duration", fmt_dec2(get(output,"EnemyStunDuration")) .. "s", "EnemyStunDuration", have(output,"EnemyStunDuration")))
    table.insert(rows, row("Inc. Item Quantity", fmt_pct_int(get(output,"LootQuantity")), nil, have(output,"LootQuantity")))
    table.insert(rows, row("Inc. Item Rarity", fmt_pct_int(get(output,"LootRarity")), nil, have(output,"LootRarity")))

    table.insert(sections, make_section("MiscEffects", "Other Effects", COL_OFFENCE, false, "left-b", {
      make_subsection("Other Effects", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Warcries
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Seismic Uptime", fmt_pct_int(get(output,"SeismicUpTimeRatio")), "SeismicUpTimeRatio", have(output,"SeismicUpTimeRatio")))
    table.insert(rows, row("Seismic Avg Dmg", fmt_dec2(get(output,"SeismicAvgDmg")), "SeismicAvgDmg", have(output,"SeismicAvgDmg")))
    table.insert(rows, row("Intimidating Uptime", fmt_pct_int(get(output,"IntimidatingUpTimeRatio")), "IntimidatingUpTimeRatio", have(output,"IntimidatingUpTimeRatio")))
    table.insert(rows, row("Rallying Uptime", fmt_pct_int(get(output,"RallyingUpTimeRatio")), "RallyingUpTimeRatio", have(output,"RallyingUpTimeRatio")))
    table.insert(rows, row("Exert Uptime", fmt_pct_int(get(output,"ExertedAttackUptimeRatio")), "ExertedAttackUptimeRatio", have(output,"ExertedAttackUptimeRatio")))

    table.insert(sections, make_section("Warcries", "Exerting Warcries", COL_OFFENCE, true, "left-b", {
      make_subsection("Warcries", rows)
    }))
  end

  -- =========================================================================
  -- COLUMN: right (Defence)
  -- =========================================================================

  -- -------------------------------------------------------------------------
  -- Attributes
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Strength", fmt_int(get(output,"Str")), "Str", have(output,"Str")))
    table.insert(rows, row("Dexterity", fmt_int(get(output,"Dex")), "Dex", have(output,"Dex")))
    table.insert(rows, row("Intelligence", fmt_int(get(output,"Int")), "Int", have(output,"Int")))
    table.insert(rows, row("Omniscience", fmt_int(get(output,"Omni")), "Omni", have(output,"Omni")))
    table.insert(rows, row("Str Required", tostring(getv(output,"ReqStrString") or ""), "ReqStr", have(output,"ReqStr")))
    table.insert(rows, row("Dex Required", tostring(getv(output,"ReqDexString") or ""), "ReqDex", have(output,"ReqDex")))
    table.insert(rows, row("Int Required", tostring(getv(output,"ReqIntString") or ""), "ReqInt", have(output,"ReqInt")))

    table.insert(sections, make_section("Attributes", "Attributes", COL_NORMAL, false, "right", {
      make_subsection("Attributes", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Life
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total", fmt_int(get(output,"Life")), "Life", true))
    table.insert(rows, row("Reserved", fmt_int(get(output,"LifeReserved")) .. " (" .. fmt_pct_int(get(output,"LifeReservedPercent")) .. ")", "LifeReserved", have(output,"LifeReserved")))
    table.insert(rows, row("Unreserved", fmt_int(get(output,"LifeUnreserved")) .. " (" .. fmt_pct_int(get(output,"LifeUnreservedPercent")) .. ")", nil, true))
    table.insert(rows, row("Recovery (regen)", fmt_int(get(output,"LifeRegenRecovery")) .. " (" .. fmt_pct(get(output,"LifeRegenPercent")) .. ")", "LifeRegenRecovery", true))
    table.insert(rows, row("Recoup", fmt_pct(get(output,"LifeRecoup")), "LifeRecoup", have(output,"LifeRecoup")))

    table.insert(sections, make_section("Life", "Life", COL_LIFE, false, "right", {
      make_subsection("Life", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Mana
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total", fmt_int(get(output,"Mana")), "Mana", true))
    table.insert(rows, row("Reserved", fmt_int(get(output,"ManaReserved")) .. " (" .. fmt_pct_int(get(output,"ManaReservedPercent")) .. ")", "ManaReserved", have(output,"ManaReserved")))
    table.insert(rows, row("Unreserved", fmt_int(get(output,"ManaUnreserved")) .. " (" .. fmt_pct_int(get(output,"ManaUnreservedPercent")) .. ")", nil, true))
    table.insert(rows, row("Recovery (regen)", fmt_int(get(output,"ManaRegenRecovery")) .. " (" .. fmt_pct(get(output,"ManaRegenPercent")) .. ")", "ManaRegenRecovery", true))
    table.insert(rows, row("Recoup", fmt_pct(get(output,"ManaRecoup")), "ManaRecoup", have(output,"ManaRecoup")))

    table.insert(sections, make_section("Mana", "Mana", COL_MANA, false, "right", {
      make_subsection("Mana", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- EnergyShield
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total", fmt_int(get(output,"EnergyShield")), "EnergyShield", true))
    table.insert(rows, row("Recharge Rate", fmt_int(get(output,"EnergyShieldRecharge")), "EnergyShieldRecharge", have(output,"EnergyShieldRechargeAppliesToEnergyShield")))
    table.insert(rows, row("Recharge Delay", fmt_dec2(get(output,"EnergyShieldRechargeDelay")) .. "s", "EnergyShieldRechargeDelay", have(output,"EnergyShieldRechargeAppliesToEnergyShield")))
    table.insert(rows, row("Recovery (regen)", fmt_int(get(output,"EnergyShieldRegenRecovery")) .. " (" .. fmt_pct(get(output,"EnergyShieldRegenPercent")) .. ")", "EnergyShieldRegenRecovery", true))
    table.insert(rows, row("Recoup", fmt_pct(get(output,"EnergyShieldRecoup")), "EnergyShieldRecoup", have(output,"EnergyShieldRecoup")))

    table.insert(sections, make_section("EnergyShield", "Energy Shield", COL_ES, false, "right", {
      make_subsection("Energy Shield", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Ward
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total", fmt_int(get(output,"Ward")), "Ward", have(output,"Ward")))
    table.insert(rows, row("Recharge Delay", fmt_dec2(get(output,"WardRechargeDelay")) .. "s", "WardRechargeDelay", have(output,"WardRechargeDelay")))

    table.insert(sections, make_section("Ward", "Ward", COL_WARD, false, "right", {
      make_subsection("Ward", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Resist
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Fire Resist", fmt_pct_int(get(output,"FireResist")) .. " (+" .. fmt_pct_int(get(output,"FireResistOverCap")) .. ")", "FireResist", true))
    table.insert(rows, row("Cold Resist", fmt_pct_int(get(output,"ColdResist")) .. " (+" .. fmt_pct_int(get(output,"ColdResistOverCap")) .. ")", "ColdResist", true))
    table.insert(rows, row("Lightning Resist", fmt_pct_int(get(output,"LightningResist")) .. " (+" .. fmt_pct_int(get(output,"LightningResistOverCap")) .. ")", "LightningResist", true))
    table.insert(rows, row("Chaos Resist", fmt_pct_int(get(output,"ChaosResist")) .. " (+" .. fmt_pct_int(get(output,"ChaosResistOverCap")) .. ")", "ChaosResist", true))

    table.insert(sections, make_section("Resist", "Resists", COL_DEFENCE, false, "right", {
      make_subsection("Resists", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Armour
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total", fmt_int(get(output,"Armour")), "Armour", true))
    table.insert(rows, row("Phys. Dmg. Reduct.", fmt_pct_int(get(output,"PhysicalDamageReduction")), "PhysicalDamageReduction", true))
    table.insert(rows, row("Fire Dmg. Reduct.", fmt_pct_int(get(output,"FireDamageReduction")), "FireDamageReduction", have(output,"FireDamageReduction")))
    table.insert(rows, row("Cold Dmg. Reduct.", fmt_pct_int(get(output,"ColdDamageReduction")), "ColdDamageReduction", have(output,"ColdDamageReduction")))
    table.insert(rows, row("Light. Dmg. Reduct.", fmt_pct_int(get(output,"LightningDamageReduction")), "LightningDamageReduction", have(output,"LightningDamageReduction")))
    table.insert(rows, row("Chaos Dmg. Reduct.", fmt_pct_int(get(output,"ChaosDamageReduction")), "ChaosDamageReduction", have(output,"ChaosDamageReduction")))

    table.insert(sections, make_section("Armour", "Armour", COL_ARMOUR, false, "right", {
      make_subsection("Armour", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Evasion
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total", fmt_int(get(output,"Evasion")), "Evasion", true))
    table.insert(rows, row("Evade Chance", fmt_pct_int(get(output,"EvadeChance")), "EvadeChance", have(output,"EvadeChance")))
    table.insert(rows, row("Melee Evade Ch.", fmt_pct_int(get(output,"MeleeEvadeChance")), "MeleeEvadeChance", have(output,"MeleeEvadeChance")))
    table.insert(rows, row("Proj. Evade Ch.", fmt_pct_int(get(output,"ProjectileEvadeChance")), "ProjectileEvadeChance", have(output,"ProjectileEvadeChance")))

    table.insert(sections, make_section("Evasion", "Evasion", COL_EVASION, false, "right", {
      make_subsection("Evasion", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- DamageAvoidance (Block / Dodge / Suppression)
  -- -------------------------------------------------------------------------
  do
    local avoidRows = {}
    table.insert(avoidRows, row("Avoid Physical Ch.", fmt_pct_int(get(output,"AvoidPhysicalDamageChance")), nil, have(output,"AvoidPhysicalDamageChance")))
    table.insert(avoidRows, row("Avoid Lightning Ch.", fmt_pct_int(get(output,"AvoidLightningDamageChance")), nil, have(output,"AvoidLightningDamageChance")))
    table.insert(avoidRows, row("Avoid Cold Chance", fmt_pct_int(get(output,"AvoidColdDamageChance")), nil, have(output,"AvoidColdDamageChance")))
    table.insert(avoidRows, row("Avoid Fire Chance", fmt_pct_int(get(output,"AvoidFireDamageChance")), nil, have(output,"AvoidFireDamageChance")))
    table.insert(avoidRows, row("Avoid Chaos Chance", fmt_pct_int(get(output,"AvoidChaosDamageChance")), nil, have(output,"AvoidChaosDamageChance")))

    local blockRows = {}
    table.insert(blockRows, row("Block Chance", fmt_pct_int(get(output,"BlockChance")) .. " (+" .. fmt_pct_int(get(output,"BlockChanceOverCap")) .. ")", "BlockChance", true))
    table.insert(blockRows, row("Spell Block", fmt_pct_int(get(output,"SpellBlockChance")) .. " (+" .. fmt_pct_int(get(output,"SpellBlockChanceOverCap")) .. ")", "SpellBlockChance", true))
    table.insert(blockRows, row("Eff. Block", fmt_pct_int(get(output,"EffectiveBlockChance")), nil, true))
    table.insert(blockRows, row("Eff. Spell Block", fmt_pct_int(get(output,"EffectiveSpellBlockChance")), nil, true))

    local dodgeRows = {}
    table.insert(dodgeRows, row("Attack Dodge Ch.", fmt_pct_int(get(output,"AttackDodgeChance")) .. " (+" .. fmt_pct_int(get(output,"AttackDodgeChanceOverCap")) .. ")", "AttackDodgeChance", true))
    table.insert(dodgeRows, row("Spell Dodge Ch.", fmt_pct_int(get(output,"SpellDodgeChance")) .. " (+" .. fmt_pct_int(get(output,"SpellDodgeChanceOverCap")) .. ")", "SpellDodgeChance", true))

    local suppressRows = {}
    table.insert(suppressRows, row("Suppression Ch.", fmt_pct_int(get(output,"SpellSuppressionChance")) .. " (+" .. fmt_pct_int(get(output,"SpellSuppressionChanceOverCap")) .. ")", nil, true))
    table.insert(suppressRows, row("Suppression Effect", fmt_pct_int(get(output,"SpellSuppressionEffect")), nil, true))
    table.insert(suppressRows, row("Eff. Suppression", fmt_pct_int(get(output,"EffectiveSpellSuppressionChance")), nil, true))

    table.insert(sections, make_section("DamageAvoidance", "Damage Avoidance", COL_DEFENCE, false, "right", {
      make_subsection("Avoidance", avoidRows),
      make_subsection("Block", blockRows),
      make_subsection("Dodge", dodgeRows),
      make_subsection("Spell Suppression", suppressRows),
    }))
  end

  -- -------------------------------------------------------------------------
  -- Flasks
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Flask Effect", fmt_pct_int(get(output,"FlaskEffect")), nil, have(output,"FlaskEffect")))
    table.insert(rows, row("Charges/s", fmt_dec2(get(output,"FlaskChargeGen")), nil, have(output,"FlaskChargeGen")))

    table.insert(sections, make_section("Flasks", "Flasks", COL_CRAFTED, true, "right", {
      make_subsection("Flasks", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Rage
  -- -------------------------------------------------------------------------
  do
    local rows = {}
    table.insert(rows, row("Total Rage", tostring(math.floor(get(output,"Rage")+0.5)), nil, have(output,"Rage")))
    table.insert(rows, row("Rage Effect", fmt_int(get(output,"RageEffect")), nil, have(output,"RageEffect")))
    table.insert(rows, row("Maximum Rage", tostring(math.floor(get(output,"MaximumRage")+0.5)), nil, have(output,"MaximumRage")))

    table.insert(sections, make_section("Rage", "Rage", COL_RAGE, true, "right", {
      make_subsection("Rage", rows)
    }))
  end

  -- -------------------------------------------------------------------------
  -- Charges
  -- -------------------------------------------------------------------------
  do
    local endRows = {}
    table.insert(endRows, row("Max", tostring(math.floor(get(output,"EnduranceChargesMax")+0.5)), nil, have(output,"EnduranceChargesMax")))
    table.insert(endRows, row("Current", tostring(math.floor(get(output,"EnduranceCharges")+0.5)), nil, have(output,"EnduranceCharges")))
    table.insert(endRows, row("Duration", tostring(math.floor(get(output,"EnduranceChargesDuration")+0.5)) .. "s", nil, have(output,"EnduranceChargesDuration")))

    local frenzyRows = {}
    table.insert(frenzyRows, row("Max", tostring(math.floor(get(output,"FrenzyChargesMax")+0.5)), nil, have(output,"FrenzyChargesMax")))
    table.insert(frenzyRows, row("Current", tostring(math.floor(get(output,"FrenzyCharges")+0.5)), nil, have(output,"FrenzyCharges")))
    table.insert(frenzyRows, row("Duration", tostring(math.floor(get(output,"FrenzyChargesDuration")+0.5)) .. "s", nil, have(output,"FrenzyChargesDuration")))

    local powerRows = {}
    table.insert(powerRows, row("Max", tostring(math.floor(get(output,"PowerChargesMax")+0.5)), nil, have(output,"PowerChargesMax")))
    table.insert(powerRows, row("Current", tostring(math.floor(get(output,"PowerCharges")+0.5)), nil, have(output,"PowerCharges")))
    table.insert(powerRows, row("Duration", tostring(math.floor(get(output,"PowerChargesDuration")+0.5)) .. "s", nil, have(output,"PowerChargesDuration")))

    table.insert(sections, make_section("Charges", "Charges", COL_NORMAL, true, "right", {
      make_subsection("Endurance", endRows),
      make_subsection("Frenzy", frenzyRows),
      make_subsection("Power", powerRows),
    }))
  end

  -- -------------------------------------------------------------------------
  -- MiscDefences (Other Defences)
  -- -------------------------------------------------------------------------
  do
    local mainRows = {}
    table.insert(mainRows, row("Movement Speed", fmt_mult(get(output,"EffectiveMovementSpeedMod")), "EffectiveMovementSpeedMod", true))
    table.insert(mainRows, row("Curse Effect on You", fmt_pct_int(get(output,"CurseEffectOnSelf")), nil, have(output,"CurseEffectOnSelf")))
    table.insert(mainRows, row("Stun Avoid Ch.", fmt_pct_int(get(output,"StunAvoidChance")), "StunAvoidChance", have(output,"StunAvoidChance")))
    table.insert(mainRows, row("Stun Threshold", tostring(math.floor(get(output,"StunThreshold")+0.5)), "StunThreshold", true))
    table.insert(mainRows, row("Stun Duration", fmt_dec2(get(output,"StunDuration")) .. "s", "StunDuration", true))
    table.insert(mainRows, row("Elusive Effect", fmt_pct_int(get(output,"ElusiveEffectMod")), "ElusiveEffectMod", have(output,"ElusiveEffectMod")))

    local fortRows = {}
    table.insert(fortRows, row("Max Stacks", tostring(math.floor(get(output,"MaximumFortification")+0.5)), "MaximumFortification", have(output,"MaximumFortification")))
    table.insert(fortRows, row("Duration", fmt_dec2(get(output,"FortifyDuration")) .. "s", "FortifyDuration", have(output,"FortifyDuration")))
    table.insert(fortRows, row("Less Dmg Taken", tostring(getv(output,"FortificationEffect") or "0") .. "%", "FortificationEffect", have(output,"FortificationEffect")))

    table.insert(sections, make_section("MiscDefences", "Other Defences", COL_DEFENCE, false, "right", {
      make_subsection("Other Defences", mainRows),
      make_subsection("Fortification", fortRows),
    }))
  end

  return sections
end

return M

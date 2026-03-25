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
import type { BreakdownLine, CalcResult } from "../types";
import { useI18n } from "../hooks/useI18n";

// ─── Stat definition types ────────────────────────────────────────────────────

type FmtType = "int" | "dec" | "pct" | "pct_x100" | "range" | "resist";

interface StatDef {
  key: string;
  label: string;
  fmt: FmtType;
  key2?: string; // used by "range" and "resist"
  breakdownKey?: string; // defaults to key
}

// ─── Section definitions (matching POB Calcs tab layout) ──────────────────────

const SECTIONS: Array<{
  label: string;
  en: string;
  stats: StatDef[];
  column: "left" | "right";
}> = [
  // ── LEFT COLUMN (offence) ─────────────────────────────────────────────────
  {
    label: "技能 DPS",
    en: "Skill DPS",
    column: "left",
    stats: [
      { key: "CombinedDPS", label: "结合 DPS", fmt: "int" },
      { key: "FullDPS", label: "最终总和 DPS", fmt: "int" },
      { key: "TotalDPS", label: "击中 DPS", fmt: "int", breakdownKey: "TotalDPS" },
      { key: "TotalDot", label: "持续伤 DPS", fmt: "int" },
      { key: "AverageHit", label: "平均击中", fmt: "int", breakdownKey: "AverageHit" },
      { key: "AverageBurstDamage", label: "爆发伤害", fmt: "int" },
      { key: "WithPoisonDPS", label: "含中毒 DPS", fmt: "int" },
      { key: "WithBleedDPS", label: "含流血 DPS", fmt: "int" },
      { key: "WithIgniteDPS", label: "含点燃 DPS", fmt: "int" },
      { key: "WithImpaleDPS", label: "含穿刺 DPS", fmt: "int" },
    ],
  },
  {
    label: "击中伤害范围",
    en: "Skill Hit Damage",
    column: "left",
    stats: [
      { key: "TotalMin", key2: "TotalMax", label: "合计", fmt: "range" },
      { key: "PhysicalMin", key2: "PhysicalMax", label: "物理", fmt: "range" },
      { key: "LightningMin", key2: "LightningMax", label: "闪电", fmt: "range" },
      { key: "ColdMin", key2: "ColdMax", label: "冰霜", fmt: "range" },
      { key: "FireMin", key2: "FireMax", label: "火焰", fmt: "range" },
      { key: "ChaosMin", key2: "ChaosMax", label: "混沌", fmt: "range" },
    ],
  },
  {
    label: "伤害类型 DPS",
    en: "DPS by Type",
    column: "left",
    stats: [
      { key: "PhysicalDPS", label: "物理 DPS", fmt: "int" },
      { key: "LightningDPS", label: "闪电 DPS", fmt: "int" },
      { key: "ColdDPS", label: "冰霜 DPS", fmt: "int" },
      { key: "FireDPS", label: "火焰 DPS", fmt: "int" },
      { key: "ChaosDPS", label: "混沌 DPS", fmt: "int" },
      { key: "ElementalDPS", label: "元素 DPS", fmt: "int" },
    ],
  },
  {
    label: "攻击/施法速率",
    en: "Attack/Cast Rate",
    column: "left",
    stats: [
      { key: "Speed", label: "速率", fmt: "dec" },
      { key: "HitSpeed", label: "命中频率", fmt: "dec" },
    ],
  },
  {
    label: "暴击",
    en: "Crits",
    column: "left",
    stats: [
      { key: "CritChance", label: "暴击率", fmt: "pct", breakdownKey: "CritChance" },
      { key: "PreEffectiveCritChance", label: "基础暴击率", fmt: "pct" },
      { key: "CritMultiplier", label: "暴击伤害", fmt: "pct_x100", breakdownKey: "CritMultiplier" },
      { key: "DoubleDamageChance", label: "双倍伤害几率", fmt: "pct" },
      { key: "TotalNonCritDPS", label: "非暴击 DPS", fmt: "int" },
      { key: "TotalCritDPS", label: "暴击 DPS", fmt: "int" },
    ],
  },
  {
    label: "命中",
    en: "Accuracy",
    column: "left",
    stats: [
      { key: "HitChance", label: "命中率", fmt: "pct" },
    ],
  },
  {
    label: "持续伤害",
    en: "Skill Damage over Time",
    column: "left",
    stats: [
      { key: "TotalDotInstance", label: "合计 DPS", fmt: "int" },
      { key: "PhysicalDot", label: "物理 DoT DPS", fmt: "int" },
      { key: "LightningDot", label: "闪电 DoT DPS", fmt: "int" },
      { key: "ColdDot", label: "冰霜 DoT DPS", fmt: "int" },
      { key: "FireDot", label: "火焰 DoT DPS", fmt: "int" },
      { key: "ChaosDot", label: "混沌 DoT DPS", fmt: "int" },
      { key: "TotalDotDPS", label: "全 DoT DPS", fmt: "int" },
      { key: "BleedDPS", label: "流血 DPS", fmt: "int" },
      { key: "BleedChance", label: "流血几率", fmt: "pct" },
      { key: "BleedDuration", label: "流血持续", fmt: "dec" },
      { key: "BleedDotMulti", label: "流血倍率", fmt: "pct_x100" },
      { key: "PoisonDPS", label: "中毒 DPS", fmt: "int" },
      { key: "PoisonChance", label: "中毒几率", fmt: "pct" },
      { key: "PoisonDuration", label: "中毒持续", fmt: "dec" },
      { key: "PoisonDotMulti", label: "中毒倍率", fmt: "pct_x100" },
      { key: "IgniteDPS", label: "点燃 DPS", fmt: "int" },
      { key: "IgniteChancePerHit", label: "点燃几率", fmt: "pct" },
      { key: "IgniteDuration", label: "点燃持续", fmt: "dec" },
      { key: "IgniteDotMulti", label: "点燃倍率", fmt: "pct_x100" },
      { key: "DecayDPS", label: "衰朽 DPS", fmt: "int" },
      { key: "ImpaleDPS", label: "穿刺 DPS", fmt: "int" },
    ],
  },
  {
    label: "偷取 & 击中获得",
    en: "Leech & Gain on Hit",
    column: "left",
    stats: [
      { key: "MaxLifeLeechRate", label: "生命最大偷取", fmt: "int" },
      { key: "LifeLeechGainRate", label: "生命偷取速率", fmt: "int", breakdownKey: "LifeLeechGainRate" },
      { key: "LifeLeechGainPerHit", label: "每击偷取生命", fmt: "int" },
      { key: "LifeOnHit", label: "击中获得生命", fmt: "int" },
      { key: "LifeOnKill", label: "击杀获得生命", fmt: "int" },
      { key: "MaxManaLeechRate", label: "魔力最大偷取", fmt: "int" },
      { key: "ManaLeechGainRate", label: "魔力偷取速率", fmt: "int", breakdownKey: "ManaLeechGainRate" },
      { key: "ManaLeechGainPerHit", label: "每击偷取魔力", fmt: "int" },
      { key: "ManaOnHit", label: "击中获得魔力", fmt: "int" },
      { key: "ManaOnKill", label: "击杀获得魔力", fmt: "int" },
      { key: "MaxEnergyShieldLeechRate", label: "护盾最大偷取", fmt: "int" },
      { key: "EnergyShieldLeechGainRate", label: "护盾偷取速率", fmt: "int", breakdownKey: "EnergyShieldLeechGainRate" },
      { key: "EnergyShieldLeechGainPerHit", label: "每击偷取护盾", fmt: "int" },
      { key: "EnergyShieldOnHit", label: "击中获得护盾", fmt: "int" },
      { key: "EnergyShieldOnKill", label: "击杀获得护盾", fmt: "int" },
    ],
  },
  {
    label: "异常状态",
    en: "Ailments",
    column: "left",
    stats: [
      { key: "ChillChance", label: "冰缓几率", fmt: "pct" },
      { key: "ChillDuration", label: "冰缓持续", fmt: "dec" },
      { key: "ChillEffectMod", label: "冰缓效果", fmt: "pct_x100" },
      { key: "FreezeChance", label: "冰冻几率", fmt: "pct" },
      { key: "FreezeDurationMod", label: "冰冻持续", fmt: "pct_x100" },
      { key: "ShockChance", label: "感电几率", fmt: "pct" },
      { key: "ShockDuration", label: "感电持续", fmt: "dec" },
      { key: "ShockEffectMod", label: "感电效果", fmt: "pct_x100" },
      { key: "ScorchChance", label: "灼烧几率", fmt: "pct" },
      { key: "ScorchEffectMod", label: "灼烧效果", fmt: "pct_x100" },
      { key: "BrittleChance", label: "易碎几率", fmt: "pct" },
      { key: "BrittleEffectMod", label: "易碎效果", fmt: "pct_x100" },
      { key: "SapChance", label: "削弱几率", fmt: "pct" },
      { key: "SapEffectMod", label: "削弱效果", fmt: "pct_x100" },
    ],
  },
  {
    label: "技能类型特定属性",
    en: "Skill type-specific Stats",
    column: "left",
    stats: [
      { key: "GemLevel", label: "宝石等级", fmt: "int" },
      { key: "GemQuality", label: "宝石品质", fmt: "int" },
      { key: "StoredUses", label: "存储次数", fmt: "int" },
      { key: "DurationUptime", label: "持续时间利用率", fmt: "pct" },
      { key: "DurationSecondaryUptime", label: "次要持续利用率", fmt: "pct" },
      { key: "AuraDurationUptime", label: "光环持续利用率", fmt: "pct" },
      { key: "ManaReservedMod", label: "魔力保留加成", fmt: "pct_x100" },
      { key: "LifeReservedMod", label: "生命保留加成", fmt: "pct_x100" },
      { key: "HeraldBuffEffectMod", label: "先驱效果加成", fmt: "pct_x100" },
      { key: "SustainableTrauma", label: "可维持创伤", fmt: "int" },
    ],
  },
  {
    label: "其他效果",
    en: "Other Effects",
    column: "left",
    stats: [
      { key: "AuraEffectMod", label: "光环效果", fmt: "pct_x100" },
      { key: "CurseEffectMod", label: "诅咒效果", fmt: "pct_x100" },
      { key: "WarcryEffectMod", label: "战吼效果", fmt: "pct_x100" },
      { key: "KnockbackChance", label: "击退几率", fmt: "pct" },
      { key: "CullPercent", label: "消灭百分比", fmt: "pct" },
      { key: "LootQuantity", label: "掉落数量", fmt: "pct" },
      { key: "LootRarity", label: "掉落品质", fmt: "pct" },
      { key: "ActiveMinionLimit", label: "召唤物上限", fmt: "int" },
      { key: "Devotion", label: "虔诚", fmt: "int" },
    ],
  },
  {
    label: "技能信息 / 范围",
    en: "Skill Info / Range",
    column: "left",
    stats: [
      { key: "AreaOfEffectRadiusMetres", label: "AOE 半径(米)", fmt: "dec" },
      { key: "WeaponRangeMetre", label: "武器范围(米)", fmt: "dec" },
      { key: "StrikeTargets", label: "打击目标数", fmt: "int" },
      { key: "ProjectileCount", label: "投射物数量", fmt: "int" },
      { key: "ProjectileSpeedMod", label: "投射物速度", fmt: "pct_x100" },
      { key: "ChainMaxString", label: "连锁次数", fmt: "int" },
      { key: "PierceCountString", label: "穿透次数", fmt: "int" },
      { key: "ForkCountString", label: "分叉次数", fmt: "int" },
      { key: "BounceCount", label: "弹射次数", fmt: "int" },
      { key: "WarcryCastTime", label: "战吼时间(秒)", fmt: "dec" },
      { key: "Duration", label: "持续时间(秒)", fmt: "dec" },
      { key: "DurationSecondary", label: "次要持续(秒)", fmt: "dec" },
      { key: "AuraDuration", label: "光环持续(秒)", fmt: "dec" },
      { key: "Cooldown", label: "冷却时间(秒)", fmt: "dec" },
    ],
  },
  {
    label: "消耗",
    en: "Cost",
    column: "left",
    stats: [
      { key: "ManaCost", label: "魔力消耗", fmt: "int", breakdownKey: "ManaCost" },
      { key: "LifeCost", label: "生命消耗", fmt: "int" },
      { key: "ESCost", label: "护盾消耗", fmt: "int" },
      { key: "RageCost", label: "怒气消耗", fmt: "int" },
      { key: "SoulCost", label: "灵魂消耗", fmt: "int" },
      { key: "ManaPerSecondCost", label: "魔力/秒", fmt: "dec" },
      { key: "LifePerSecondCost", label: "生命/秒", fmt: "dec" },
      { key: "ESPerSecondCost", label: "护盾/秒", fmt: "dec" },
      { key: "RagePerSecondCost", label: "怒气/秒", fmt: "dec" },
    ],
  },
  {
    label: "属性",
    en: "Attributes",
    column: "left",
    stats: [
      { key: "Str", label: "力量", fmt: "int", breakdownKey: "Str" },
      { key: "Dex", label: "敏捷", fmt: "int", breakdownKey: "Dex" },
      { key: "Int", label: "智慧", fmt: "int", breakdownKey: "Int" },
      { key: "Omni", label: "全属性", fmt: "int" },
      { key: "ReqStr", label: "力量需求", fmt: "int" },
      { key: "ReqDex", label: "敏捷需求", fmt: "int" },
      { key: "ReqInt", label: "智慧需求", fmt: "int" },
    ],
  },
  // ── RIGHT COLUMN (defence) ────────────────────────────────────────────────
  {
    label: "受到伤害",
    en: "Damage Taken",
    column: "right",
    stats: [
      { key: "totalEnemyDamage", label: "总敌方伤害", fmt: "int" },
      { key: "PhysicalEnemyDamage", label: "物理", fmt: "int" },
      { key: "LightningEnemyDamage", label: "闪电", fmt: "int" },
      { key: "ColdEnemyDamage", label: "冰霜", fmt: "int" },
      { key: "FireEnemyDamage", label: "火焰", fmt: "int" },
      { key: "ChaosEnemyDamage", label: "混沌", fmt: "int" },
      { key: "totalTakenDamage", label: "减伤后总计", fmt: "int" },
      { key: "PhysicalTakenDamage", label: "减伤后物理", fmt: "int" },
      { key: "LightningTakenDamage", label: "减伤后闪电", fmt: "int" },
      { key: "ColdTakenDamage", label: "减伤后冰霜", fmt: "int" },
      { key: "FireTakenDamage", label: "减伤后火焰", fmt: "int" },
      { key: "ChaosTakenDamage", label: "减伤后混沌", fmt: "int" },
    ],
  },
  {
    label: "受击伤害",
    en: "Damaging Hits",
    column: "right",
    stats: [
      { key: "totalTakenHit", label: "受击总伤害", fmt: "int" },
      { key: "PhysicalTakenHit", label: "物理", fmt: "int" },
      { key: "LightningTakenHit", label: "闪电", fmt: "int" },
      { key: "ColdTakenHit", label: "冰霜", fmt: "int" },
      { key: "FireTakenHit", label: "火焰", fmt: "int" },
      { key: "ChaosTakenHit", label: "混沌", fmt: "int" },
      { key: "PhysicalTakenHitMult", label: "物理倍率", fmt: "pct_x100" },
      { key: "LightningTakenHitMult", label: "闪电倍率", fmt: "pct_x100" },
      { key: "ColdTakenHitMult", label: "冰霜倍率", fmt: "pct_x100" },
      { key: "FireTakenHitMult", label: "火焰倍率", fmt: "pct_x100" },
      { key: "ChaosTakenHitMult", label: "混沌倍率", fmt: "pct_x100" },
    ],
  },
  {
    label: "有效 HP 池",
    en: "Effective Health Pool",
    column: "right",
    stats: [
      { key: "TotalEHP", label: "有效 HP", fmt: "int" },
      { key: "EHPSurvivalTime", label: "存活时间(秒)", fmt: "dec" },
      { key: "NumberOfDamagingHits", label: "可承受击中次数", fmt: "dec" },
      { key: "TotalNumberOfHits", label: "总击中次数", fmt: "dec" },
      { key: "ConfiguredDamageChance", label: "配置伤害几率", fmt: "pct_x100" },
      { key: "ConfiguredNotHitChance", label: "未命中几率", fmt: "pct_x100" },
    ],
  },
  {
    label: "最大受击上限",
    en: "Maximum Hit Taken",
    column: "right",
    stats: [
      { key: "PhysicalMaximumHitTaken", label: "物理", fmt: "int" },
      { key: "LightningMaximumHitTaken", label: "闪电", fmt: "int" },
      { key: "ColdMaximumHitTaken", label: "冰霜", fmt: "int" },
      { key: "FireMaximumHitTaken", label: "火焰", fmt: "int" },
      { key: "ChaosMaximumHitTaken", label: "混沌", fmt: "int" },
    ],
  },
  {
    label: "回复 & 随时间受击",
    en: "Recoup and Hit Taken Over Time",
    column: "right",
    stats: [
      { key: "LifeRecoup", label: "生命回复%", fmt: "pct_x100" },
      { key: "LifeRecoupRecoveryMax", label: "生命回复(最大)", fmt: "int" },
      { key: "LifeRecoupRecoveryAvg", label: "生命回复(均)", fmt: "int" },
      { key: "ManaRecoup", label: "魔力回复%", fmt: "pct_x100" },
      { key: "ManaRecoupRecoveryMax", label: "魔力回复(最大)", fmt: "int" },
      { key: "ManaRecoupRecoveryAvg", label: "魔力回复(均)", fmt: "int" },
      { key: "EnergyShieldRecoup", label: "护盾回复%", fmt: "pct_x100" },
      { key: "EnergyShieldRecoupRecoveryMax", label: "护盾回复(最大)", fmt: "int" },
      { key: "EnergyShieldRecoupRecoveryAvg", label: "护盾回复(均)", fmt: "int" },
      { key: "LifeLossLostMax", label: "生命损失(最大)", fmt: "int" },
      { key: "LifeLossLostAvg", label: "生命损失(均)", fmt: "int" },
      { key: "netLifeRecoupAndLossLostOverTimeMax", label: "净回复-损失(最大)", fmt: "int" },
      { key: "netLifeRecoupAndLossLostOverTimeAvg", label: "净回复-损失(均)", fmt: "int" },
    ],
  },
  {
    label: "净再生 & 衰减",
    en: "Dots & Build Degens",
    column: "right",
    stats: [
      { key: "TotalNetRegen", label: "净再生", fmt: "int" },
      { key: "TotalBuildDegen", label: "总衰减", fmt: "int" },
      { key: "NetLifeRegen", label: "生命净再生", fmt: "int", breakdownKey: "NetLifeRegen" },
      { key: "NetManaRegen", label: "魔力净再生", fmt: "int", breakdownKey: "NetManaRegen" },
      { key: "NetEnergyShieldRegen", label: "护盾净再生", fmt: "int", breakdownKey: "NetEnergyShieldRegen" },
      { key: "FullDotDPS", label: "全 DoT DPS", fmt: "int" },
      { key: "PhysicalBuildDegen", label: "物理衰减/秒", fmt: "int" },
      { key: "LightningBuildDegen", label: "闪电衰减/秒", fmt: "int" },
      { key: "ColdBuildDegen", label: "冰霜衰减/秒", fmt: "int" },
      { key: "FireBuildDegen", label: "火焰衰减/秒", fmt: "int" },
      { key: "ChaosBuildDegen", label: "混沌衰减/秒", fmt: "int" },
      { key: "PhysicalTakenDotMult", label: "物理 DoT 倍率", fmt: "pct_x100" },
      { key: "LightningTakenDotMult", label: "闪电 DoT 倍率", fmt: "pct_x100" },
      { key: "ColdTakenDotMult", label: "冰霜 DoT 倍率", fmt: "pct_x100" },
      { key: "FireTakenDotMult", label: "火焰 DoT 倍率", fmt: "pct_x100" },
      { key: "ChaosTakenDotMult", label: "混沌 DoT 倍率", fmt: "pct_x100" },
      { key: "PhysicalTotalPool", label: "物理总池", fmt: "int" },
      { key: "LightningTotalPool", label: "闪电总池", fmt: "int" },
      { key: "ColdTotalPool", label: "冰霜总池", fmt: "int" },
      { key: "FireTotalPool", label: "火焰总池", fmt: "int" },
      { key: "ChaosTotalPool", label: "混沌总池", fmt: "int" },
      { key: "PhysicalDotEHP", label: "物理 DoT EHP", fmt: "dec" },
      { key: "LightningDotEHP", label: "闪电 DoT EHP", fmt: "dec" },
      { key: "ColdDotEHP", label: "冰霜 DoT EHP", fmt: "dec" },
      { key: "FireDotEHP", label: "火焰 DoT EHP", fmt: "dec" },
      { key: "ChaosDotEHP", label: "混沌 DoT EHP", fmt: "dec" },
    ],
  },
  {
    label: "敌方衰减",
    en: "Enemy Degens",
    column: "right",
    stats: [
      { key: "TotalDegen", label: "总衰减/秒", fmt: "int" },
      { key: "PhysicalEnemyDegen", label: "物理衰减/秒", fmt: "int" },
      { key: "LightningEnemyDegen", label: "闪电衰减/秒", fmt: "int" },
      { key: "ColdEnemyDegen", label: "冰霜衰减/秒", fmt: "int" },
      { key: "FireEnemyDegen", label: "火焰衰减/秒", fmt: "int" },
      { key: "ChaosEnemyDegen", label: "混沌衰减/秒", fmt: "int" },
      { key: "ComprehensiveTotalNetRegen", label: "综合净再生", fmt: "int" },
      { key: "ComprehensiveNetLifeRegen", label: "综合生命净再生", fmt: "int" },
      { key: "ComprehensiveNetManaRegen", label: "综合魔力净再生", fmt: "int" },
      { key: "ComprehensiveNetEnergyShieldRegen", label: "综合护盾净再生", fmt: "int" },
    ],
  },
  {
    label: "生命",
    en: "Life",
    column: "right",
    stats: [
      { key: "Life", label: "总生命", fmt: "int", breakdownKey: "Life" },
      { key: "LifeUnreserved", label: "未保留", fmt: "int" },
      { key: "LifeReserved", label: "已保留", fmt: "int" },
      { key: "LifeRecoverable", label: "可回复量", fmt: "int" },
      { key: "LifeRegen", label: "再生速率", fmt: "dec" },
      { key: "LifeRegenRecovery", label: "再生回复", fmt: "int" },
      { key: "Spec:LifeInc", label: "增加生命%", fmt: "int" },
    ],
  },
  {
    label: "魔力",
    en: "Mana",
    column: "right",
    stats: [
      { key: "Mana", label: "总魔力", fmt: "int", breakdownKey: "Mana" },
      { key: "ManaUnreserved", label: "未保留", fmt: "int" },
      { key: "ManaReserved", label: "已保留", fmt: "int" },
      { key: "ManaRegen", label: "再生速率", fmt: "dec" },
      { key: "ManaRegenRecovery", label: "再生回复", fmt: "int" },
      { key: "Spec:ManaInc", label: "增加魔力%", fmt: "int" },
    ],
  },
  {
    label: "能量护盾",
    en: "Energy Shield",
    column: "right",
    stats: [
      { key: "EnergyShield", label: "总护盾", fmt: "int", breakdownKey: "EnergyShield" },
      { key: "EnergyShieldRecoveryCap", label: "可回复上限", fmt: "int" },
      { key: "EnergyShieldRecharge", label: "充能速率", fmt: "int" },
      { key: "EnergyShieldRechargeDelay", label: "充能延迟(秒)", fmt: "dec" },
      { key: "EnergyShieldRegenRecovery", label: "再生回复", fmt: "int" },
      { key: "Spec:EnergyShieldInc", label: "增加护盾%", fmt: "int" },
    ],
  },
  {
    label: "Ward",
    en: "Ward",
    column: "right",
    stats: [
      { key: "Ward", label: "Ward 总量", fmt: "int", breakdownKey: "Ward" },
      { key: "WardRechargeDelay", label: "充能延迟(秒)", fmt: "dec" },
    ],
  },
  {
    label: "抗性",
    en: "Resistances",
    column: "right",
    stats: [
      { key: "FireResist", key2: "FireResistOverCap", label: "火焰", fmt: "resist", breakdownKey: "FireResist" },
      { key: "ColdResist", key2: "ColdResistOverCap", label: "冰霜", fmt: "resist", breakdownKey: "ColdResist" },
      { key: "LightningResist", key2: "LightningResistOverCap", label: "闪电", fmt: "resist", breakdownKey: "LightningResist" },
      { key: "ChaosResist", key2: "ChaosResistOverCap", label: "混沌", fmt: "resist", breakdownKey: "ChaosResist" },
    ],
  },
  {
    label: "护甲",
    en: "Armour",
    column: "right",
    stats: [
      { key: "Armour", label: "护甲值", fmt: "int", breakdownKey: "Armour" },
      { key: "PhysicalDamageReduction", label: "物理减伤", fmt: "pct", breakdownKey: "PhysicalDamageReduction" },
      { key: "FireDamageReduction", label: "火焰减伤", fmt: "pct" },
      { key: "ColdDamageReduction", label: "冰霜减伤", fmt: "pct" },
      { key: "LightningDamageReduction", label: "闪电减伤", fmt: "pct" },
      { key: "ChaosDamageReduction", label: "混沌减伤", fmt: "pct" },
      { key: "Spec:ArmourInc", label: "增加护甲%", fmt: "int" },
    ],
  },
  {
    label: "闪避",
    en: "Evasion",
    column: "right",
    stats: [
      { key: "Evasion", label: "闪避值", fmt: "int", breakdownKey: "Evasion" },
      { key: "EvadeChance", label: "闪避几率", fmt: "pct" },
      { key: "MeleeEvadeChance", label: "近战闪避", fmt: "pct" },
      { key: "ProjectileEvadeChance", label: "远程闪避", fmt: "pct" },
      { key: "Spec:EvasionInc", label: "增加闪避%", fmt: "int" },
    ],
  },
  {
    label: "伤害规避",
    en: "Damage Avoidance",
    column: "right",
    stats: [
      { key: "EffectiveBlockChance", label: "攻击格挡", fmt: "pct", breakdownKey: "EffectiveBlockChance" },
      { key: "BlockChance", label: "格挡几率", fmt: "pct" },
      { key: "BlockChanceOverCap", label: "格挡超限", fmt: "pct" },
      { key: "EffectiveSpellBlockChance", label: "法术格挡", fmt: "pct", breakdownKey: "EffectiveSpellBlockChance" },
      { key: "SpellBlockChance", label: "法术格挡几率", fmt: "pct" },
      { key: "SpellBlockChanceOverCap", label: "法术格挡超限", fmt: "pct" },
      { key: "EffectiveSpellSuppressionChance", label: "法术压制", fmt: "pct", breakdownKey: "EffectiveSpellSuppressionChance" },
      { key: "SpellSuppressionChance", label: "压制几率", fmt: "pct" },
      { key: "SpellSuppressionEffect", label: "压制效果", fmt: "pct_x100" },
      { key: "AttackDodgeChance", label: "攻击躲避", fmt: "pct", breakdownKey: "AttackDodgeChance" },
      { key: "EffectiveAttackDodgeChance", label: "有效攻击躲避", fmt: "pct" },
      { key: "SpellDodgeChance", label: "法术躲避", fmt: "pct", breakdownKey: "SpellDodgeChance" },
      { key: "EffectiveSpellDodgeChance", label: "有效法术躲避", fmt: "pct" },
    ],
  },
  {
    label: "药剂",
    en: "Flasks",
    column: "right",
    stats: [
      { key: "FlaskChargeGen", label: "充能速率", fmt: "pct_x100" },
      { key: "FlaskEffect", label: "药剂效果", fmt: "pct_x100" },
      { key: "FlaskChargeOnCritChance", label: "暴击充能几率", fmt: "pct" },
    ],
  },
  {
    label: "功能药剂",
    en: "Utility Flasks",
    column: "right",
    stats: [
      { key: "UtilityFlaskChargeGen", label: "充能速率", fmt: "pct_x100" },
    ],
  },
  {
    label: "生命药剂",
    en: "Life Flasks",
    column: "right",
    stats: [
      { key: "LifeFlaskChargeGen", label: "充能速率", fmt: "pct_x100" },
    ],
  },
  {
    label: "魔力药剂",
    en: "Mana Flasks",
    column: "right",
    stats: [
      { key: "ManaFlaskChargeGen", label: "充能速率", fmt: "pct_x100" },
    ],
  },
  {
    label: "酊剂",
    en: "Tinctures",
    column: "right",
    stats: [
      { key: "TinctureEffect", label: "酊剂效果", fmt: "pct_x100" },
      { key: "TinctureLimit", label: "酊剂上限", fmt: "int" },
    ],
  },
  {
    label: "充能",
    en: "Charges",
    column: "right",
    stats: [
      { key: "EnduranceCharges", label: "耐久充能", fmt: "int" },
      { key: "EnduranceChargesMax", label: "最大耐久", fmt: "int" },
      { key: "EnduranceChargesDuration", label: "耐久持续(秒)", fmt: "dec" },
      { key: "FrenzyCharges", label: "狂热充能", fmt: "int" },
      { key: "FrenzyChargesMax", label: "最大狂热", fmt: "int" },
      { key: "FrenzyChargesDuration", label: "狂热持续(秒)", fmt: "dec" },
      { key: "PowerCharges", label: "能量充能", fmt: "int" },
      { key: "PowerChargesMax", label: "最大能量", fmt: "int" },
      { key: "PowerChargesDuration", label: "能量持续(秒)", fmt: "dec" },
    ],
  },
  {
    label: "怒气",
    en: "Rage",
    column: "right",
    stats: [
      { key: "Rage", label: "怒气", fmt: "int" },
      { key: "MaximumRage", label: "最大怒气", fmt: "int" },
      { key: "RageEffect", label: "怒气效果", fmt: "pct_x100" },
      { key: "RageRegenRecovery", label: "怒气再生", fmt: "dec" },
      { key: "InherentRageLoss", label: "固有怒气损失", fmt: "dec" },
      { key: "InherentRageLossDelay", label: "损失延迟(秒)", fmt: "dec" },
    ],
  },
  {
    label: "其他防御",
    en: "Other Defences",
    column: "right",
    stats: [
      { key: "EffectiveMovementSpeedMod", label: "移动速度", fmt: "pct_x100" },
    ],
  },
  {
    label: "坚毅",
    en: "Fortification",
    column: "right",
    stats: [
      { key: "MaximumFortification", label: "最大坚毅", fmt: "int" },
      { key: "MinimumFortification", label: "最小坚毅", fmt: "int" },
      { key: "FortifyDuration", label: "坚毅持续(秒)", fmt: "dec" },
      { key: "FortificationEffect", label: "坚毅效果", fmt: "pct_x100" },
    ],
  },
  {
    label: "眩晕 & 其他规避",
    en: "Stun & Other Avoidance",
    column: "right",
    stats: [
      { key: "StunAvoidChance", label: "眩晕规避", fmt: "pct" },
      { key: "StunThreshold", label: "眩晕阈值", fmt: "int" },
      { key: "StunDuration", label: "眩晕持续", fmt: "pct_x100" },
      { key: "BlindAvoidChance", label: "致盲规避", fmt: "pct" },
      { key: "CritExtraDamageReduction", label: "暴击减伤", fmt: "pct" },
    ],
  },
  {
    label: "异常状态防御",
    en: "Ailment Defence",
    column: "right",
    stats: [
      { key: "ShockAvoidChance", label: "感电规避", fmt: "pct" },
      { key: "FreezeAvoidChance", label: "冰冻规避", fmt: "pct" },
      { key: "ChillAvoidChance", label: "冰缓规避", fmt: "pct" },
      { key: "IgniteAvoidChance", label: "点燃规避", fmt: "pct" },
      { key: "BleedAvoidChance", label: "流血规避", fmt: "pct" },
      { key: "PoisonAvoidChance", label: "中毒规避", fmt: "pct" },
      { key: "CurseAvoidChance", label: "诅咒规避", fmt: "pct" },
      { key: "SelfFreezeDuration", label: "被冻结持续", fmt: "pct_x100" },
      { key: "SelfChillDuration", label: "被冰缓持续", fmt: "pct_x100" },
      { key: "SelfShockDuration", label: "被感电持续", fmt: "pct_x100" },
      { key: "SelfIgniteDuration", label: "被点燃持续", fmt: "pct_x100" },
      { key: "SelfBleedDuration", label: "被流血持续", fmt: "pct_x100" },
      { key: "SelfPoisonDuration", label: "被中毒持续", fmt: "pct_x100" },
      { key: "SelfFreezeEffect", label: "被冻结效果", fmt: "pct_x100" },
      { key: "SelfChillEffect", label: "被冰缓效果", fmt: "pct_x100" },
      { key: "SelfShockEffect", label: "被感电效果", fmt: "pct_x100" },
      { key: "SelfIgniteEffect", label: "被点燃效果", fmt: "pct_x100" },
    ],
  },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(value: number, f: FmtType): string {
  switch (f) {
    case "pct":
      return `${value.toFixed(1)}%`;
    case "pct_x100":
      return `${(value * 100).toFixed(0)}%`;
    case "dec":
      return value.toFixed(2);
    case "int":
      return Math.round(value).toLocaleString();
    default:
      return Math.round(value).toLocaleString();
  }
}

// ─── Shared props ─────────────────────────────────────────────────────────────

interface StatRowProps {
  def: StatDef;
  stats: Record<string, number>;
  breakdown?: Record<string, BreakdownLine[]>;
  t: (s: string) => string;
}

// ─── Helper: build display string (shared between StatRow and StatCell) ───────

function buildDisplay(
  def: StatDef,
  stats: Record<string, number>
): string | null {
  const val = stats[def.key];
  if (val === undefined || val === null) return null;

  if (def.fmt === "range") {
    const val2 = stats[def.key2!];
    if ((val === 0 || val === undefined) && (val2 === 0 || val2 === undefined))
      return null;
    return `${Math.round(val).toLocaleString()} ~ ${Math.round(val2 ?? 0).toLocaleString()}`;
  }

  if (def.fmt === "resist") {
    const overcap = stats[def.key2!] ?? 0;
    return overcap > 0
      ? `${val.toFixed(1)}% (+${overcap.toFixed(1)}%)`
      : `${val.toFixed(1)}%`;
  }

  if (val === 0) return null;
  return fmt(val, def.fmt);
}

// ─── StatRow (label-left, value-right — used by right panel) ─────────────────

function StatRow({ def, stats, breakdown, t }: StatRowProps) {
  const display = buildDisplay(def, stats);
  if (display === null) return null;

  const bkKey = def.breakdownKey ?? def.key;
  const bkLines = breakdown?.[bkKey];
  const hasBreakdown = bkLines && bkLines.length > 0;

  if (!hasBreakdown) {
    return (
      <div className="flex justify-between py-[2px] text-xs">
        <span className="text-muted-foreground">{def.label}</span>
        <span className="font-mono">{display}</span>
      </div>
    );
  }

  return (
    <div className="flex justify-between py-[2px] text-xs">
      <span className="text-muted-foreground">{def.label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <span className="font-mono text-primary underline decoration-dotted underline-offset-2 cursor-pointer">
            {display}
          </span>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="center"
          sideOffset={8}
          className="w-72 p-3"
        >
          <div className="text-xs font-semibold mb-2">{def.label} 构成</div>
          <div className="flex flex-col gap-0.5">
            {bkLines.map((line, i) => (
              <div
                key={i}
                className="text-xs text-muted-foreground font-mono leading-snug"
              >
                {t(line.label)}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── StatCell (label-on-top, value-below — used by left panel grid) ───────────

function StatCell({ def, stats, breakdown, t }: StatRowProps) {
  const display = buildDisplay(def, stats);
  if (display === null) return null;

  const bkKey = def.breakdownKey ?? def.key;
  const bkLines = breakdown?.[bkKey];
  const hasBreakdown = bkLines && bkLines.length > 0;

  const valueEl = hasBreakdown ? (
    <Popover>
      <PopoverTrigger asChild>
        <span className="font-mono text-xs text-primary underline decoration-dotted cursor-pointer leading-tight">
          {display}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={8}
        className="w-72 p-3"
      >
        <div className="text-xs font-semibold mb-2">{def.label} 构成</div>
        <div className="flex flex-col gap-0.5">
          {bkLines.map((line, i) => (
            <div
              key={i}
              className="text-xs text-muted-foreground font-mono leading-snug"
            >
              {t(line.label)}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  ) : (
    <span className="font-mono text-xs leading-tight">{display}</span>
  );

  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] text-muted-foreground leading-tight truncate">
        {def.label}
      </span>
      {valueEl}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  en: string;
  stats: StatDef[];
  data: Record<string, number>;
  breakdown?: Record<string, BreakdownLine[]>;
  layout?: "grid" | "list";
  t: (s: string) => string;
}

function Section({
  label,
  en,
  stats: defs,
  data,
  breakdown,
  layout = "list",
  t,
}: SectionProps) {
  const [open, setOpen] = useState(true);

  // Determine if any stat in this section has data
  const hasAny = defs.some((d) => {
    if (d.fmt === "range")
      return (data[d.key] ?? 0) !== 0 || (data[d.key2!] ?? 0) !== 0;
    if (d.fmt === "resist") return data[d.key] !== undefined;
    return data[d.key] !== undefined && data[d.key] !== 0;
  });
  if (!hasAny) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="break-inside-avoid">
      <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {open ? (
          <CaretDown className="h-2.5 w-2.5" />
        ) : (
          <CaretRight className="h-2.5 w-2.5" />
        )}
        {label}
        <span className="text-[9px] text-muted-foreground/50 font-normal normal-case tracking-normal ml-0.5">
          {en}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {layout === "grid" ? (
          <div
            className="grid gap-x-2 gap-y-1 px-1 pb-1"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            }}
          >
            {defs.map((d) => (
              <StatCell
                key={d.key}
                def={d}
                stats={data}
                breakdown={breakdown}
                t={t}
              />
            ))}
          </div>
        ) : (
          <div className="px-1 pb-1">
            {defs.map((d) => (
              <StatRow
                key={d.key}
                def={d}
                stats={data}
                breakdown={breakdown}
                t={t}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── CalcsTab ─────────────────────────────────────────────────────────────────

interface Props {
  result: CalcResult;
}

export function CalcsTab({ result }: Props) {
  const { t } = useI18n();
  const leftSections = SECTIONS.filter((s) => s.column === "left");
  const rightSections = SECTIONS.filter((s) => s.column === "right");

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — offence, multi-column grid */}
      <div className="flex-1 min-w-0 overflow-y-auto p-2">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          }}
        >
          {leftSections.map((s) => (
            <Section
              key={s.label}
              label={s.label}
              en={s.en}
              stats={s.stats}
              data={result.stats ?? {}}
              breakdown={result.breakdown}
              layout="grid"
              t={t}
            />
          ))}
        </div>
      </div>
      {/* Divider */}
      <div className="w-px bg-border shrink-0" />
      {/* Right — defence, single list */}
      <div className="w-[200px] shrink-0 overflow-y-auto p-2 flex flex-col gap-1">
        {rightSections.map((s) => (
          <Section
            key={s.label}
            label={s.label}
            en={s.en}
            stats={s.stats}
            data={result.stats ?? {}}
            breakdown={result.breakdown}
            layout="list"
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CalcResult } from "../types";

// 标签来源：PoeCharm2 zh-rCN/BuildDisplayStats.csv
// 无对应翻译的条目保留英文原文
const STAT_GROUPS = [
  {
    label: "伤害",
    stats: [
      { key: "CombinedDPS", label: "结合 DPS", fmt: "int" },
      { key: "FullDPS", label: "最终总和DPS", fmt: "int" },
      { key: "TotalDPS", label: "击中 DPS", fmt: "int" },
      { key: "TotalDot", label: "持续伤 DPS", fmt: "int" },
      { key: "AverageHit", label: "平均击中", fmt: "int" },
      { key: "CritChance", label: "暴击率", fmt: "pct" },
      { key: "CritMultiplier", label: "暴击伤害", fmt: "pct" },
      { key: "Speed", label: "攻击速度", fmt: "dec" },
      { key: "HitChance", label: "命中率", fmt: "pct" },
    ],
  },
  {
    label: "防御",
    stats: [
      { key: "Life", label: "生命", fmt: "int" },
      { key: "EnergyShield", label: "能量护盾", fmt: "int" },
      { key: "Mana", label: "魔力", fmt: "int" },
      { key: "Ward", label: "Ward", fmt: "int" },
      { key: "TotalEHP", label: "有效HP", fmt: "int" },
      { key: "Armour", label: "护甲", fmt: "int" },
      { key: "Evasion", label: "闪避值", fmt: "int" },
      { key: "FireResist", label: "火焰抗性", fmt: "pct" },
      { key: "ColdResist", label: "冰霜抗性", fmt: "pct" },
      { key: "LightningResist", label: "闪电抗性", fmt: "pct" },
      { key: "ChaosResist", label: "混沌抗性", fmt: "pct" },
      { key: "PhysicalDamageReduction", label: "物理伤害减免", fmt: "pct" },
      { key: "AttackDodgeChance", label: "攻击躲避几率", fmt: "pct" },
      { key: "SpellDodgeChance", label: "法术躲避几率", fmt: "pct" },
      { key: "EffectiveBlockChance", label: "攻击格挡几率", fmt: "pct" },
    ],
  },
  {
    label: "费用",
    stats: [
      { key: "ManaCost", label: "魔力消耗", fmt: "int" },
      { key: "LifeCost", label: "生命消耗", fmt: "int" },
      { key: "ManaUnreserved", label: "未保留魔力", fmt: "int" },
      { key: "LifeUnreserved", label: "未保留生命", fmt: "int" },
      { key: "NetLifeRegen", label: "生命再生", fmt: "int" },
      { key: "NetManaRegen", label: "魔力再生", fmt: "int" },
      { key: "NetEnergyShieldRegen", label: "能量护盾再生", fmt: "int" },
    ],
  },
];

function formatStat(value: number, fmt: string): string {
  if (fmt === "pct") return `${value.toFixed(1)}%`;
  if (fmt === "int") return Math.round(value).toLocaleString();
  return value.toFixed(2);
}

interface StatRowProps {
  label: string;
  value: number;
  fmt: string;
}

function StatRow({ label, value, fmt }: StatRowProps) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{formatStat(value, fmt)}</span>
    </div>
  );
}

interface StatGroupProps {
  label: string;
  stats: Array<{ key: string; label: string; fmt: string }>;
  data: Record<string, number>;
}

function StatGroup({ label, stats, data }: StatGroupProps) {
  const [open, setOpen] = useState(true);

  // 只显示有数据的行
  const visibleStats = stats.filter(
    ({ key }) => data[key] !== undefined && data[key] !== 0,
  );
  if (visibleStats.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {open ? (
          <CaretDown className="h-3 w-3" />
        ) : (
          <CaretRight className="h-3 w-3" />
        )}
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {visibleStats.map(({ key, label, fmt }) => (
          <StatRow key={key} label={label} value={data[key]} fmt={fmt} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  result: CalcResult;
}

export function StatsPanel({ result }: Props) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide mb-1">
        统计数据
      </div>
      {STAT_GROUPS.map((group) => (
        <StatGroup
          key={group.label}
          label={group.label}
          stats={group.stats}
          data={result.stats ?? {}}
        />
      ))}
    </div>
  );
}

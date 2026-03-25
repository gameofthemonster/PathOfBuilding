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

// 标签来源：PoeCharm2 zh-rCN/BuildDisplayStats.csv
// 无对应翻译的条目保留英文原文
const STAT_GROUPS = [
  {
    label: "伤害",
    en: "Offence",
    stats: [
      { key: "CombinedDPS", label: "结合 DPS", fmt: "int" },
      { key: "FullDPS", label: "最终总和DPS", fmt: "int" },
      { key: "TotalDPS", label: "击中 DPS", fmt: "int" },
      { key: "TotalDot", label: "持续伤 DPS", fmt: "int" },
      { key: "AverageHit", label: "平均击中", fmt: "int" },
      { key: "CritChance", label: "暴击率", fmt: "pct" },
      { key: "CritMultiplier", label: "暴击伤害", fmt: "pct_x100" },
      { key: "Speed", label: "攻击速度", fmt: "dec" },
      { key: "HitChance", label: "命中率", fmt: "pct" },
    ],
  },
  {
    label: "防御",
    en: "Defence",
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
    label: "消耗",
    en: "Cost",
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
  if (fmt === "pct_x100") return `${(value * 100).toFixed(0)}%`;
  if (fmt === "int") return Math.round(value).toLocaleString();
  return value.toFixed(2);
}

interface StatRowProps {
  label: string;
  value: number;
  fmt: string;
  breakdown?: BreakdownLine[];
  t: (s: string) => string;
}

function StatRow({ label, value, fmt, breakdown, t }: StatRowProps) {
  const formatted = formatStat(value, fmt);

  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="flex justify-between py-0.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{formatted}</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex justify-between py-0.5 text-sm cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono font-medium text-primary underline decoration-dotted underline-offset-2">
            {formatted}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-64 p-3">
        <div className="text-xs font-semibold mb-2 text-foreground">
          {label} 构成
        </div>
        <div className="flex flex-col gap-0.5">
          {breakdown.filter((e) => e.label !== undefined).map((entry, i) => (
            <div key={i} className="text-xs text-muted-foreground font-mono">
              {t(entry.label!)}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface StatGroupProps {
  label: string;
  en: string;
  stats: Array<{ key: string; label: string; fmt: string }>;
  data: Record<string, number>;
  breakdown?: Record<string, BreakdownLine[]>;
  t: (s: string) => string;
}

function StatGroup({ label, en, stats, data, breakdown, t }: StatGroupProps) {
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
        <span className="text-[10px] text-muted-foreground/50 font-normal normal-case tracking-normal ml-0.5">{en}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {visibleStats.map(({ key, label, fmt }) => (
          <StatRow
            key={key}
            label={label}
            value={data[key]}
            fmt={fmt}
            breakdown={breakdown?.[key]}
            t={t}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  result: CalcResult;
}

export function StatsPanel({ result }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide mb-1">
        统计数据 <span className="text-[10px] text-muted-foreground/50 font-normal normal-case tracking-normal">Stats</span>
      </div>
      {STAT_GROUPS.map((group) => (
        <StatGroup
          key={group.label}
          label={group.label}
          en={group.en}
          stats={group.stats}
          data={result.stats ?? {}}
          breakdown={result.breakdown}
          t={t}
        />
      ))}
    </div>
  );
}

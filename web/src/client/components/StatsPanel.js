import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
const STAT_GROUPS = [
    {
        label: "伤害",
        stats: [
            { key: "CombinedDPS", label: "综合 DPS", fmt: "int" },
            { key: "FullDPS", label: "全部 DPS", fmt: "int" },
            { key: "TotalDPS", label: "技能 DPS", fmt: "int" },
            { key: "TotalDot", label: "持续伤害 DPS", fmt: "int" },
            { key: "AverageHit", label: "平均单次", fmt: "int" },
            { key: "CritChance", label: "暴击率", fmt: "pct" },
            { key: "CritMultiplier", label: "暴击倍率", fmt: "pct" },
            { key: "Speed", label: "攻击速度", fmt: "dec" },
            { key: "HitChance", label: "命中率", fmt: "pct" },
        ],
    },
    {
        label: "防御",
        stats: [
            { key: "Life", label: "生命", fmt: "int" },
            { key: "EnergyShield", label: "能量护盾", fmt: "int" },
            { key: "Mana", label: "法力", fmt: "int" },
            { key: "Ward", label: "守护", fmt: "int" },
            { key: "TotalEHP", label: "有效HP", fmt: "int" },
            { key: "Armour", label: "护甲", fmt: "int" },
            { key: "Evasion", label: "闪避", fmt: "int" },
            { key: "FireResist", label: "火抗", fmt: "pct" },
            { key: "ColdResist", label: "冰抗", fmt: "pct" },
            { key: "LightningResist", label: "雷抗", fmt: "pct" },
            { key: "ChaosResist", label: "混沌抗", fmt: "pct" },
            { key: "PhysicalDamageReduction", label: "物减", fmt: "pct" },
            { key: "AttackDodgeChance", label: "闪避攻击", fmt: "pct" },
            { key: "SpellDodgeChance", label: "闪避法术", fmt: "pct" },
            { key: "EffectiveBlockChance", label: "格挡", fmt: "pct" },
        ],
    },
    {
        label: "费用",
        stats: [
            { key: "ManaCost", label: "法力消耗", fmt: "int" },
            { key: "LifeCost", label: "生命消耗", fmt: "int" },
            { key: "ManaUnreserved", label: "可用法力", fmt: "int" },
            { key: "LifeUnreserved", label: "可用生命", fmt: "int" },
            { key: "NetLifeRegen", label: "净生命回复", fmt: "int" },
            { key: "NetManaRegen", label: "净法力回复", fmt: "int" },
            { key: "NetEnergyShieldRegen", label: "净ES回复", fmt: "int" },
        ],
    },
];
function formatStat(value, fmt) {
    if (fmt === "pct")
        return `${value.toFixed(1)}%`;
    if (fmt === "int")
        return Math.round(value).toLocaleString();
    return value.toFixed(2);
}
function StatRow({ label, value, fmt }) {
    return (_jsxs("div", { className: "flex justify-between py-0.5 text-sm", children: [_jsx("span", { className: "text-muted-foreground", children: label }), _jsx("span", { className: "font-mono font-medium", children: formatStat(value, fmt) })] }));
}
function StatGroup({ label, stats, data }) {
    const [open, setOpen] = useState(true);
    // 只显示有数据的行
    const visibleStats = stats.filter(({ key }) => data[key] !== undefined && data[key] !== 0);
    if (visibleStats.length === 0)
        return null;
    return (_jsxs(Collapsible, { open: open, onOpenChange: setOpen, children: [_jsxs(CollapsibleTrigger, { className: "flex items-center gap-1 w-full py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground", children: [open ? _jsx(ChevronDown, { className: "h-3 w-3" }) : _jsx(ChevronRight, { className: "h-3 w-3" }), label] }), _jsx(CollapsibleContent, { children: visibleStats.map(({ key, label, fmt }) => (_jsx(StatRow, { label: label, value: data[key], fmt: fmt }, key))) })] }));
}
export function StatsPanel({ result }) {
    return (_jsxs("div", { className: "flex flex-col gap-2 p-3", children: [_jsx("div", { className: "text-xs font-semibold uppercase tracking-wide mb-1", children: "\u7EDF\u8BA1\u6570\u636E" }), STAT_GROUPS.map((group) => (_jsx(StatGroup, { label: group.label, stats: group.stats, data: result.stats }, group.label)))] }));
}

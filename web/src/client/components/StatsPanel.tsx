import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BreakdownLine, CalcResult, DisplayStat } from "../types";
import { useI18n } from "../hooks/useI18n";

// 将 Lua format 字符串转换为格式化数值字符串
// Lua fmt 示例: "d", ".1f", "d%%", ".2f%%", "+d%%", ".2fs", ".1fm"
function formatLuaStat(value: number, fmt: string): string {
  const signed = fmt.startsWith("+");
  const prefix = signed && value >= 0 ? "+" : "";
  const hasPct = fmt.includes("%%");
  const hasSuffix = !hasPct && /[smf]$/.test(fmt);
  const suffix = hasPct ? "%" : fmt.endsWith("s") && hasSuffix ? "s" : fmt.endsWith("m") && hasSuffix ? "m" : "";

  if (/^[+]?d/.test(fmt)) {
    return prefix + Math.round(value).toLocaleString() + suffix;
  }
  const m = fmt.match(/\.(\d+)f/);
  const decimals = m ? parseInt(m[1]) : 2;
  return prefix + value.toFixed(decimals) + suffix;
}

interface StatRowProps {
  stat: DisplayStat;
  breakdown?: BreakdownLine[];
  t: (s: string) => string;
}

function StatRow({ stat, breakdown, t }: StatRowProps) {
  if (!stat.label || stat.value === undefined || stat.fmt === undefined) return null;
  const formatted = formatLuaStat(stat.value, stat.fmt);
  const labelStyle = stat.color ? { color: "#" + stat.color } : undefined;

  if (!breakdown || breakdown.length === 0) {
    return (
      <div className="flex justify-between py-0.5 text-sm">
        <span className="text-muted-foreground" style={labelStyle}>{t(stat.label ?? "")}</span>
        <span className="font-mono font-medium">{formatted}</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex justify-between py-0.5 text-sm cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1">
          <span className="text-muted-foreground" style={labelStyle}>{t(stat.label ?? "")}</span>
          <span className="font-mono font-medium text-primary underline decoration-dotted underline-offset-2">
            {formatted}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-64 p-3">
        <div className="text-xs font-semibold mb-2 text-foreground">
          {t(stat.label ?? "")} 构成
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

interface Props {
  result: CalcResult;
}

export function StatsPanel({ result }: Props) {
  const { t } = useI18n();
  const displayStats = result.displayStats ?? [];

  return (
    <div className="flex flex-col gap-0 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide mb-2">
        统计数据 <span className="text-[10px] text-muted-foreground/50 font-normal normal-case tracking-normal">Stats</span>
      </div>
      {displayStats.map((stat, i) => {
        if (stat.separator) {
          return <div key={i} className="my-1 border-t border-border/20" />;
        }
        return (
          <StatRow
            key={i}
            stat={stat}
            breakdown={stat.stat ? result.breakdown?.[stat.stat] : undefined}
            t={t}
          />
        );
      })}
    </div>
  );
}

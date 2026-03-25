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
import type { BreakdownLine, BuildConfig, CalcResult, CalcSection, CalcRow } from "../types";
import { MainSkillSelector } from "./MainSkillSelector";

function BreakdownPopoverContent({
  lines,
  label,
}: {
  lines: BreakdownLine[];
  label: string;
}) {
  const textLines = lines.filter((l) => l.label !== undefined);
  const slotLines = lines.filter((l) => l.source !== undefined);
  return (
    <>
      <div className="text-xs font-semibold mb-2">{label} 构成</div>
      {textLines.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {textLines.map((line, i) => (
            <div key={i} className="text-xs text-muted-foreground font-mono leading-snug">
              {line.label}
            </div>
          ))}
        </div>
      )}
      {slotLines.length > 0 && (
        <>
          {textLines.length > 0 && <div className="my-1.5 border-t border-border/30" />}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground/60 text-[10px]">
                <th className="text-right pr-3 font-normal pb-0.5">值</th>
                <th className="text-left font-normal pb-0.5">来源</th>
              </tr>
            </thead>
            <tbody>
              {slotLines.map((line, i) => (
                <tr key={i}>
                  <td className="text-right pr-3 font-mono">{line.total}</td>
                  <td className="text-left text-muted-foreground">{line.sourceName || line.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

interface RenderedRowProps {
  row: CalcRow;
  breakdown?: Record<string, BreakdownLine[]>;
}

function RenderedRow({ row, breakdown }: RenderedRowProps) {
  const bkLines = row.breakdownKey ? breakdown?.[row.breakdownKey] : undefined;

  const valueEl = bkLines?.length ? (
    <Popover>
      <PopoverTrigger asChild>
        <button className="font-mono text-xs leading-tight text-right cursor-pointer hover:text-primary tabular-nums">
          {row.value}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="center" sideOffset={8} className="w-72 p-3">
        <BreakdownPopoverContent lines={bkLines} label={row.label} />
      </PopoverContent>
    </Popover>
  ) : (
    <span className="font-mono text-xs leading-tight text-right tabular-nums">{row.value}</span>
  );

  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 min-w-0">
      <span className="text-[10px] text-muted-foreground truncate shrink">{row.label}</span>
      {valueEl}
    </div>
  );
}

interface RenderedSectionProps {
  section: CalcSection;
  breakdown?: Record<string, BreakdownLine[]>;
  searchQuery: string;
}

function RenderedSection({ section, breakdown, searchQuery }: RenderedSectionProps) {
  const [open, setOpen] = useState(!section.defaultCollapsed);

  const lq = searchQuery.toLowerCase();
  const filteredSubs = section.subsections.map((sub) => ({
    sub,
    rows: sub.rows.filter((r) => {
      if (r.hidden) return false;
      if (!lq) return true;
      return r.label.toLowerCase().includes(lq);
    }),
  }));

  if (!filteredSubs.some((fs) => fs.rows.length > 0)) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="break-inside-avoid">
      <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {open ? <CaretDown className="h-2.5 w-2.5" /> : <CaretRight className="h-2.5 w-2.5" />}
        <span>{section.label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-1 pb-1 flex flex-col gap-0">
          {filteredSubs.map(({ sub, rows }, si) => {
            if (!rows.length) return null;
            return (
              <div key={si}>
                {sub.label && (
                  <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wide pt-1 pb-0.5">
                    {sub.label}
                  </div>
                )}
                {rows.map((r, ri) => (
                  <RenderedRow key={ri} row={r} breakdown={breakdown} />
                ))}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  result: CalcResult;
  buildConfig?: BuildConfig | null;
  onMainSkillChange?: (index: number) => void;
  onSkillPartChange?: (partIndex: number) => void;
}

export function CalcsTab({ result, buildConfig, onMainSkillChange, onSkillPartChange }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const sections = result?.calcSections ?? [];

  const colA = sections.filter((s) => s.column === "left-a");
  const colB = sections.filter((s) => s.column === "left-b");
  const colRight = sections.filter((s) => s.column === "right");

  const sectionProps = (s: CalcSection) => ({
    section: s,
    breakdown: result.breakdown,
    searchQuery,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {buildConfig && buildConfig.skills.length > 0 && onMainSkillChange && (
        <div className="shrink-0 border-b border-border/40">
          <MainSkillSelector
            skills={buildConfig.skills}
            mainSocketGroup={buildConfig.mainSocketGroup}
            onChange={onMainSkillChange}
            skillParts={result.skillParts}
            skillPartIndex={result.skillPartIndex}
            onSkillPartChange={onSkillPartChange}
          />
        </div>
      )}
      {/* 搜索框 */}
      <div className="shrink-0 px-2 py-1 border-b border-border/40">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索 stat..."
          className="w-full text-[10px] bg-transparent border border-border/40 rounded px-1.5 py-0.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Col A — 进攻核心 */}
        <div className="flex-1 min-w-[180px] overflow-y-auto px-2 py-2 flex flex-col gap-0.5 border-r border-border/40">
          {colA.map((s) => <RenderedSection key={s.id} {...sectionProps(s)} />)}
        </div>
        {/* Col B — DoT / 偷取 / 辅助 */}
        <div className="flex-1 min-w-[180px] overflow-y-auto px-2 py-2 flex flex-col gap-0.5 border-r border-border/40">
          {colB.map((s) => <RenderedSection key={s.id} {...sectionProps(s)} />)}
        </div>
        {/* Col C — 防御 */}
        <div className="w-[220px] shrink-0 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
          {colRight.map((s) => <RenderedSection key={s.id} {...sectionProps(s)} />)}
        </div>
      </div>
    </div>
  );
}

import type { BuildConfig, GemInstance } from "../types";
import { Input } from "@/components/ui/input";

interface GemRowProps {
  gem: GemInstance;
  onChange: (updated: Partial<GemInstance>) => void;
}

function GemRow({ gem, onChange }: GemRowProps) {
  const isSupport = gem.skillId.includes("Support");
  const nameColor = isSupport ? "text-blue-400" : "text-orange-400";
  return (
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-muted/20">
      <span className={`text-xs flex-1 min-w-0 truncate ${nameColor}`}>
        {gem.nameSpec || gem.skillId}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">等级</span>
        <Input
          type="number"
          min={1}
          max={23}
          value={gem.level}
          onChange={(e) => onChange({ level: parseInt(e.target.value, 10) })}
          className="w-12 h-6 text-xs text-center px-1"
        />
        <span className="text-xs text-muted-foreground">品质</span>
        <Input
          type="number"
          min={0}
          max={23}
          value={gem.quality}
          onChange={(e) => onChange({ quality: parseInt(e.target.value, 10) })}
          className="w-12 h-6 text-xs text-center px-1"
        />
        <input
          type="checkbox"
          checked={gem.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-3.5 w-3.5 shrink-0 accent-primary cursor-pointer"
        />
      </div>
    </div>
  );
}

interface Props {
  buildConfig: BuildConfig;
  onSkillChange: (
    groupIndex: number,
    gemIndex: number,
    updated: Partial<GemInstance>,
  ) => void;
}

export function SkillsTab({ buildConfig, onSkillChange }: Props) {
  return (
    <div className="flex flex-col max-w-xl">
      {buildConfig.skills.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          没有找到技能配置
        </div>
      )}
      {buildConfig.skills.map((group, gi) => (
        <div key={gi} className="border-t border-border/40 first:border-t-0">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-border/40 flex items-center gap-2">
            <span>{group.label || group.slot || `组 ${gi + 1}`}</span>
            {group.slot && group.label && (
              <span className="text-[10px] text-muted-foreground/50 normal-case tracking-normal font-normal">
                {group.slot}
              </span>
            )}
          </div>
          {group.gems.map((gem, ji) => (
            <GemRow
              key={ji}
              gem={gem}
              onChange={(updated) => onSkillChange(gi, ji, updated)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

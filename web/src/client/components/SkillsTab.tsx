import { useState, useEffect, useRef, memo } from "react";
import type { BuildConfig, GemInstance } from "../types";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n, t } from "../hooks/useI18n";

interface SkillEntry {
  skillId: string;
  name: string;
  color: number; // 1=Str/red, 2=Dex/green, 3=Int/blue
}

// color(1|2|3) × support(true|false) → tailwind class
function skillColor(color: number, isSupport: boolean): string {
  if (color === 1) return isSupport ? "text-red-300/80"   : "text-red-400";
  if (color === 2) return isSupport ? "text-green-300/80" : "text-green-400";
  if (color === 3) return isSupport ? "text-blue-300/80"  : "text-blue-400";
  return isSupport ? "text-blue-400" : "text-orange-400";
}

// ─── 模块级缓存：加载一次，不触发重渲染 ──────────────────────────────────────

let _skillsCache: SkillEntry[] = [];
let _colorMap: Map<string, string> = new Map();
const _skillListeners: Array<() => void> = [];

function onSkillsLoaded(data: SkillEntry[]) {
  _skillsCache = data;
  _colorMap = new Map();
  for (const s of data) {
    _colorMap.set(s.skillId, skillColor(s.color, s.skillId.includes("Support")));
  }
  _skillListeners.forEach((fn) => fn());
}

let _fetchStarted = false;

function useSkillsLoaded(): boolean {
  const [loaded, setLoaded] = useState(_skillsCache.length > 0);
  useEffect(() => {
    if (_skillsCache.length > 0) return;
    const trigger = () => setLoaded(true);
    _skillListeners.push(trigger);
    if (!_fetchStarted) {
      _fetchStarted = true;
      fetch("/api/skills")
        .then((r) => r.json())
        .then((data: SkillEntry[]) => {
          if (Array.isArray(data) && data.length > 0) onSkillsLoaded(data);
        })
        .catch(() => {});
    }
    return () => {
      const idx = _skillListeners.indexOf(trigger);
      if (idx >= 0) _skillListeners.splice(idx, 1);
    };
  }, []);
  return loaded;
}

function resolveGemColor(skillId: string): string {
  return _colorMap.get(skillId) ?? (skillId.includes("Support") ? "text-blue-400" : "text-orange-400");
}

// ─── GemRow ───────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 100;

interface GemRowProps {
  gem: GemInstance;
  onChange: (updated: Partial<GemInstance>) => void;
  gemColor: string;
}

const GemRow = memo(function GemRow({ gem, onChange, gemColor }: GemRowProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const currentItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && currentItemRef.current && listRef.current) {
      const container = listRef.current;
      const item = currentItemRef.current;
      container.scrollTop = item.offsetTop - container.clientHeight / 2 + item.offsetHeight / 2;
    }
  }, [open]);

  // 只在弹窗打开时计算过滤列表
  const q = open ? query.trim().toLowerCase() : "";
  let filtered: SkillEntry[] = [];
  let hasMore = false;
  if (open) {
    if (!q) {
      filtered = _skillsCache.slice(0, MAX_VISIBLE);
      hasMore = _skillsCache.length > MAX_VISIBLE;
    } else {
      filtered = _skillsCache.filter(
        (c) => c.skillId.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
      );
    }
  }

  function selectSkill(c: SkillEntry) {
    onChange({ skillId: c.skillId, nameSpec: c.name });
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      const exact = filtered.find(
        (c) => c.skillId === query.trim() || c.name === query.trim(),
      );
      if (exact) {
        selectSkill(exact);
      } else {
        onChange({ skillId: query.trim(), nameSpec: query.trim() });
        setOpen(false);
        setQuery("");
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-muted/20">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
        <PopoverTrigger asChild>
          <span
            className={`text-xs flex-1 min-w-0 truncate cursor-pointer hover:underline ${gemColor}`}
            title="点击更换技能"
          >
            {t(gem.nameSpec || gem.skillId)}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-1"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索技能 / Skill name..."
            className="h-7 text-xs mb-1"
          />
          <div ref={listRef} className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {query ? `按 Enter 使用 "${query.trim()}"` : "加载中..."}
              </div>
            ) : (
              <>
                {filtered.map((c) => {
                  const isSupport = c.skillId.includes("Support");
                  const color = skillColor(c.color, isSupport);
                  const displayName = t(c.name);
                  const isCurrent = c.skillId === gem.skillId;
                  const showEn = displayName !== c.name;
                  return (
                    <div
                      key={c.skillId}
                      ref={isCurrent ? currentItemRef : undefined}
                      className={`px-2 py-1 cursor-pointer rounded-sm hover:bg-accent ${isCurrent ? "bg-accent/50" : ""}`}
                      onClick={() => selectSkill(c)}
                    >
                      <div className={`text-xs leading-tight ${color}`}>{displayName}</div>
                      {showEn && (
                        <div className="text-[10px] leading-tight text-muted-foreground/50 truncate">{c.name}</div>
                      )}
                    </div>
                  );
                })}
                {hasMore && (
                  <div className="px-2 py-1 text-xs text-muted-foreground/50 italic">
                    输入关键词搜索更多技能...
                  </div>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

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
});

// ─── SkillsTab ────────────────────────────────────────────────────────────────

interface Props {
  buildConfig: BuildConfig;
  mainSocketGroup: number;
  onSkillChange: (groupIndex: number, gemIndex: number, updated: Partial<GemInstance>) => void;
  onMainSkillChange: (index: number) => void;
}

export function SkillsTab({ buildConfig, mainSocketGroup, onSkillChange, onMainSkillChange }: Props) {
  const { t: _t } = useI18n(); // 仅用于订阅翻译表加载后的重渲
  useSkillsLoaded();            // 仅用于订阅技能列表加载后的重渲

  if (buildConfig.skills.length === 0) {
    return <div className="px-3 py-4 text-sm text-muted-foreground">没有找到技能配置</div>;
  }

  return (
    <div className="flex flex-col max-w-xl">
      {buildConfig.skills.map((group, gi) => {
        const isMain = mainSocketGroup === gi + 1;
        return (
          <div key={gi} className="border-t border-border/40 first:border-t-0">
            <div
              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide border-b border-border/40 flex items-center gap-2 select-none ${
                isMain
                  ? "bg-primary/20 text-primary border-l-2 border-l-primary"
                  : "text-muted-foreground bg-muted/30 border-l-2 border-l-transparent"
              }`}
            >
              <span>{_t(group.label) || _t(group.slot) || `组 ${gi + 1}`}</span>
              {group.slot && group.label && (
                <span className="text-[10px] text-muted-foreground/50 normal-case tracking-normal font-normal">
                  {_t(group.slot)}
                </span>
              )}
              {isMain && (
                <span className="ml-auto text-[9px] text-primary/70 font-normal normal-case tracking-normal">
                  主技能
                </span>
              )}
            </div>
            {group.gems.map((gem, ji) => (
              <GemRow
                key={ji}
                gem={gem}
                gemColor={resolveGemColor(gem.skillId)}
                onChange={(updated) => onSkillChange(gi, ji, updated)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

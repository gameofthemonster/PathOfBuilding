import { useState, useRef, useCallback } from "react";
import type { BuildConfig, Item } from "../types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "../hooks/useI18n";

// ─── Slot definitions ─────────────────────────────────────────────────────────

const GEAR_SLOTS = [
  "Weapon 1",
  "Weapon 2",
  "Helmet",
  "Body Armour",
  "Gloves",
  "Boots",
  "Amulet",
  "Ring 1",
  "Ring 2",
  "Belt",
];

const FLASK_SLOTS = ["Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"];

const SLOT_ORDER = [...GEAR_SLOTS, ...FLASK_SLOTS];

const SLOT_LABELS: Record<string, string> = {
  "Weapon 1": "主手武器",
  "Weapon 2": "副手武器",
  Helmet: "头盔",
  "Body Armour": "胸甲",
  Gloves: "手套",
  Boots: "靴子",
  Amulet: "护身符",
  "Ring 1": "戒指 1",
  "Ring 2": "戒指 2",
  Belt: "腰带",
  "Flask 1": "药剂 1",
  "Flask 2": "药剂 2",
  "Flask 3": "药剂 3",
  "Flask 4": "药剂 4",
  "Flask 5": "药剂 5",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 只有这些 tag 会出现在 PoB 词缀行开头（shaper/elder/crusader 等旧势力不出现在词缀行）
const MOD_TYPE_FLAGS = new Set([
  "crafted",
  "custom",
  "exarch",
  "eater",
  "fractured",
  "scourge",
  "crucible",
  "mutated",
  "synthesis",
  "enchant",
  "primalcraft",
]);

interface ModTypeInfo {
  label: string;
  textColor: string;
  labelColor: string;
}
const MOD_TYPE_DISPLAY: Record<string, ModTypeInfo> = {
  crafted: {
    label: "工艺",
    textColor: "text-sky-300/90",
    labelColor: "text-sky-400/70",
  },
  exarch: {
    label: "焚界",
    textColor: "text-orange-300/90",
    labelColor: "text-orange-400/70",
  },
  eater: {
    label: "灭世",
    textColor: "text-teal-300/90",
    labelColor: "text-teal-400/70",
  },
  fractured: {
    label: "分裂",
    textColor: "text-yellow-600/90",
    labelColor: "text-yellow-700/80",
  },
  scourge: {
    label: "天灾",
    textColor: "text-red-300/90",
    labelColor: "text-red-400/70",
  },
  crucible: {
    label: "熔炉",
    textColor: "text-amber-300/90",
    labelColor: "text-amber-400/70",
  },
  synthesis: {
    label: "忆境",
    textColor: "text-fuchsia-300/90",
    labelColor: "text-fuchsia-400/70",
  },
  enchant: {
    label: "附魔",
    textColor: "text-cyan-300/90",
    labelColor: "text-purple-400/70",
  },
};

const RARITY_COLORS: Record<string, string> = {
  UNIQUE: "text-orange-400",
  RARE: "text-yellow-400",
  MAGIC: "text-blue-400",
  NORMAL: "text-gray-200",
};

const RARITY_MOD_COLORS: Record<string, string> = {
  UNIQUE: "text-orange-300/90",
  RARE: "text-sky-300/90",
  MAGIC: "text-blue-300/90",
  NORMAL: "text-gray-300/80",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

interface ModEntry {
  text: string;
  tags: string[]; // MOD_TYPE_FLAGS 里的类型 tag
  posLabel?: "前缀" | "后缀"; // 由 Prefix:/Suffix: header 计数推断（仅 PoB 工坊制作的装备才有）
}

function parseItemMods(rawText: string): {
  implicits: ModEntry[];
  explicits: ModEntry[];
} {
  const lines = rawText.split("\n").map((l) => l.trim());
  let implicitCount = 0;
  let pastHeader = false;
  let prefixCount = 0;
  let suffixCount = 0;
  const mods: ModEntry[] = [];
  const pendingTags: string[] = []; // 从单独标记行带入下一行

  for (const line of lines) {
    if (!line || line.startsWith("<")) continue;

    // Header 行：计数 Prefix/Suffix（仅工坊制作装备有，游戏导入装备没有）
    // 注意：Prefix:/Suffix: 的值是词缀 ID，不是词缀文本，只取计数
    if (/^Prefix:/.test(line)) {
      prefixCount++;
      continue;
    }
    if (/^Suffix:/.test(line)) {
      suffixCount++;
      continue;
    }

    const implicitMatch = line.match(/^Implicits:\s*(\d+)$/);
    if (implicitMatch) {
      implicitCount = parseInt(implicitMatch[1]);
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;

    // 中文客户端格式：单独一行 "锁定" 表示下一条是锁定词缀
    if (line === "锁定") {
      pendingTags.push("crafted");
      continue;
    }

    // 提取行首 {tag} 标记（忽略带冒号的值标记如 {range:0.5}、{tags:life}、{variant:1}）
    const tags: string[] = [...pendingTags];
    pendingTags.length = 0;
    let rest = line;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = /^\{([^}]+)\}/.exec(rest)) !== null) {
      const key = tagMatch[1].split(":")[0];
      if (MOD_TYPE_FLAGS.has(key)) tags.push(key);
      rest = rest.slice(tagMatch[0].length);
    }

    if (rest.trim()) {
      mods.push({ text: decodeEntities(rest.trim()), tags });
    } else if (tags.length > 0) {
      // 全是 tag 没有文本（如单独的 {crafted}），携带给下一行
      pendingTags.push(...tags);
    }
  }

  const implicits = mods.slice(0, implicitCount);
  const explicits = mods.slice(implicitCount);

  // 按 Prefix:/Suffix: header 数量给显式词缀打位置标签
  // 使用原始位置索引（不跳过特殊 tag 词缀），因为 Prefix:/Suffix: 计数包含所有词缀（包括锁定词缀）
  if (prefixCount > 0 || suffixCount > 0) {
    for (let i = 0; i < explicits.length; i++) {
      if (i < prefixCount) {
        explicits[i].posLabel = "前缀";
      } else if (i < prefixCount + suffixCount) {
        explicits[i].posLabel = "后缀";
      }
    }
  }

  return { implicits, explicits };
}

// ─── SlotGroup (left panel group) ────────────────────────────────────────────

interface SlotGroupProps {
  label: string;
  en: string;
  slots: string[];
  getItem: (slotName: string) => Item | null;
  selectedSlot: string;
  onSelect: (slotName: string) => void;
  t: (s: string) => string;
}

function SlotGroup({
  label,
  en,
  slots,
  getItem,
  selectedSlot,
  onSelect,
  t,
}: SlotGroupProps) {
  return (
    <div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-border/40">
        {label}{" "}
        <span className="text-[9px] text-muted-foreground/50 font-normal normal-case tracking-normal">
          {en}
        </span>
      </div>
      {slots.map((slotName) => {
        const item = getItem(slotName);
        const isSelected = selectedSlot === slotName;
        return (
          <div
            key={slotName}
            onClick={() => onSelect(slotName)}
            className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer border-l-2 transition-colors
              ${
                isSelected
                  ? "border-l-primary bg-muted/60"
                  : "border-l-transparent hover:bg-muted/30"
              }`}
          >
            <span className="text-xs text-muted-foreground shrink-0 w-20 pt-px">
              {SLOT_LABELS[slotName]}
            </span>
            {item ? (
              <div className="min-w-0">
                <div
                  className={`truncate text-xs ${RARITY_COLORS[item.rarity] ?? ""}`}
                >
                  {t(item.name || item.base)}
                </div>
                {item.name && item.base && (
                  <div className="truncate text-[10px] text-muted-foreground/60">
                    {t(item.base)}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground/40 italic">
                空
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ItemDetail (right panel) ────────────────────────────────────────────────

interface ItemDetailProps {
  slotLabel: string;
  item: Item | null;
  onReplace: (rawText: string) => void;
  t: (s: string) => string;
}

function ItemDetail({ slotLabel, item, onReplace, t }: ItemDetailProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function handleReplace() {
    if (draft.trim()) {
      onReplace(draft.trim());
      setEditing(false);
      setDraft("");
    }
  }

  const mods = item ? parseItemMods(item.rawText) : null;
  const modColor = item
    ? (RARITY_MOD_COLORS[item.rarity] ?? "text-muted-foreground")
    : "";

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Item header */}
      {item ? (
        <div>
          <div
            className={`text-base font-semibold leading-tight ${RARITY_COLORS[item.rarity] ?? ""}`}
          >
            {t(item.name || item.base)}
          </div>
          {item.name && item.base && (
            <div className="text-sm text-muted-foreground">{t(item.base)}</div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">
          {slotLabel}（空）
        </div>
      )}

      {/* Mods */}
      {item &&
        mods &&
        (mods.implicits.length > 0 || mods.explicits.length > 0) && (
          <div className="border border-border/40 rounded p-2 flex flex-col gap-0.5">
            {mods.implicits.map((mod, i) => {
              // 隐性词缀也可能有类型标签：{crafted}=附魔, {exarch}=炙热, {eater}=吞噬, {synthesis}=合成 等
              const specialTag = mod.tags.find((tag) => MOD_TYPE_DISPLAY[tag]);
              const typeInfo = specialTag
                ? MOD_TYPE_DISPLAY[specialTag]
                : undefined;
              const textColor = typeInfo?.textColor ?? "text-yellow-300/80";
              return (
                <div
                  key={`imp-${i}`}
                  className="flex items-baseline gap-1.5 leading-snug"
                >
                  {typeInfo ? (
                    <span
                      className={`text-[9px] font-medium shrink-0 w-7 text-right ${typeInfo.labelColor}`}
                    >
                      {typeInfo.label}
                    </span>
                  ) : (
                    <span className="shrink-0 w-7" />
                  )}
                  <span className={`text-xs ${textColor}`}>{t(mod.text)}</span>
                </div>
              );
            })}
            {mods.implicits.length > 0 && mods.explicits.length > 0 && (
              <div className="my-1 border-t border-border/30" />
            )}
            {mods.explicits.map((mod, i) => {
              // 优先取 special tag 信息，否则用 posLabel（前缀/后缀）
              const specialTag = mod.tags.find((t) => MOD_TYPE_DISPLAY[t]);
              const typeInfo = specialTag
                ? MOD_TYPE_DISPLAY[specialTag]
                : undefined;
              const label = typeInfo?.label ?? mod.posLabel ?? null;
              const labelColor =
                typeInfo?.labelColor ??
                (mod.posLabel === "前缀"
                  ? "text-blue-400/60"
                  : "text-pink-400/60");
              const textColor =
                typeInfo?.textColor ??
                (mod.posLabel === "前缀"
                  ? "text-blue-300/90"
                  : mod.posLabel === "后缀"
                    ? "text-pink-300/90"
                    : "text-muted-foreground/70");
              return (
                <div
                  key={`exp-${i}`}
                  className="flex items-baseline gap-1.5 leading-snug"
                >
                  {label ? (
                    <span
                      className={`text-[9px] font-medium shrink-0 w-7 text-right ${labelColor}`}
                    >
                      {label}
                    </span>
                  ) : (
                    <span className="shrink-0 w-7" />
                  )}
                  <span className={`text-xs ${textColor}`}>{t(mod.text)}</span>
                </div>
              );
            })}
          </div>
        )}

      {/* Replace section */}
      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">粘贴装备文本</div>
          <Textarea
            className="text-[12px] h-48"
            placeholder={"Rarity: UNIQUE\nItem Name\nBase Type\n..."}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleReplace} disabled={!draft.trim()}>
              替换装备
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => setEditing(true)}
        >
          {item ? "替换装备" : "装备物品"}
        </Button>
      )}
    </div>
  );
}

// ─── ItemsTab ─────────────────────────────────────────────────────────────────

interface Props {
  buildConfig: BuildConfig;
  onItemChange: (slotName: string, newItemText: string) => void;
}

export function ItemsTab({ buildConfig, onItemChange }: Props) {
  const { t } = useI18n();
  const [selectedSlot, setSelectedSlot] = useState(SLOT_ORDER[0]);
  const [leftWidth, setLeftWidth] = useState(420);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const { itemList, slots } = buildConfig.items;

  function getItem(slotName: string): Item | null {
    const itemId = slots[slotName];
    if (!itemId) return null;
    return itemList.find((i) => i.id === itemId) ?? null;
  }

  const selectedItem = getItem(selectedSlot);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = leftWidth;

      function onMouseMove(e: MouseEvent) {
        if (!dragging.current) return;
        const delta = e.clientX - startX.current;
        setLeftWidth(Math.max(140, Math.min(480, startWidth.current + delta)));
      }

      function onMouseUp() {
        dragging.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [leftWidth],
  );

  return (
    <div className="flex h-full">
      {/* 左侧：插槽列表 */}
      <div
        style={{ width: leftWidth }}
        className="shrink-0 overflow-y-auto border-r"
      >
        <SlotGroup
          label="装备"
          en="Items"
          slots={GEAR_SLOTS}
          getItem={getItem}
          selectedSlot={selectedSlot}
          onSelect={setSelectedSlot}
          t={t}
        />
        <SlotGroup
          label="药剂"
          en="Flasks"
          slots={FLASK_SLOTS}
          getItem={getItem}
          selectedSlot={selectedSlot}
          onSelect={setSelectedSlot}
          t={t}
        />
      </div>

      {/* 拖拽分隔线 */}
      <div
        onMouseDown={onDividerMouseDown}
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
      />

      {/* 右侧：详情 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <ItemDetail
          slotLabel={SLOT_LABELS[selectedSlot] ?? selectedSlot}
          item={selectedItem}
          onReplace={(text) => onItemChange(selectedSlot, text)}
          t={t}
        />
      </div>
    </div>
  );
}

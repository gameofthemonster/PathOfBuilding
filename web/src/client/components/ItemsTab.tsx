import { useState, useRef, useCallback } from "react";
import type { BuildConfig, Item } from "../types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

function parseItemMods(rawText: string): {
  implicits: string[];
  explicits: string[];
} {
  const lines = rawText.split("\n").map((l) => l.trim());
  let implicitCount = 0;
  let pastHeader = false;
  const mods: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("<")) continue;
    const m = line.match(/^Implicits:\s*(\d+)$/);
    if (m) {
      implicitCount = parseInt(m[1]);
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    mods.push(decodeEntities(line));
  }
  return {
    implicits: mods.slice(0, implicitCount),
    explicits: mods.slice(implicitCount),
  };
}

// ─── SlotGroup (left panel group) ────────────────────────────────────────────

interface SlotGroupProps {
  label: string;
  en: string;
  slots: string[];
  getItem: (slotName: string) => Item | null;
  selectedSlot: string;
  onSelect: (slotName: string) => void;
}

function SlotGroup({
  label,
  en,
  slots,
  getItem,
  selectedSlot,
  onSelect,
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
            className={`flex items-baseline gap-2 px-3 py-1.5 cursor-pointer border-l-2 transition-colors
              ${
                isSelected
                  ? "border-l-primary bg-muted/60"
                  : "border-l-transparent hover:bg-muted/30"
              }`}
          >
            <span className="text-xs text-muted-foreground shrink-0 w-20">
              {SLOT_LABELS[slotName]}
            </span>
            <span
              className={`truncate text-xs ${item ? (RARITY_COLORS[item.rarity] ?? "") : "text-muted-foreground/40 italic"}`}
            >
              {item ? item.name || item.base : "空"}
            </span>
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
}

function ItemDetail({ slotLabel, item, onReplace }: ItemDetailProps) {
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
            {item.name || item.base}
          </div>
          {item.name && item.base && (
            <div className="text-sm text-muted-foreground">{item.base}</div>
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
            {mods.implicits.map((mod, i) => (
              <div
                key={`imp-${i}`}
                className="text-xs text-yellow-300/80 leading-snug"
              >
                {mod}
              </div>
            ))}
            {mods.implicits.length > 0 && mods.explicits.length > 0 && (
              <div className="my-1 border-t border-border/30" />
            )}
            {mods.explicits.map((mod, i) => (
              <div
                key={`exp-${i}`}
                className={`text-xs ${modColor} leading-snug`}
              >
                {mod}
              </div>
            ))}
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
        />
        <SlotGroup
          label="药剂"
          en="Flasks"
          slots={FLASK_SLOTS}
          getItem={getItem}
          selectedSlot={selectedSlot}
          onSelect={setSelectedSlot}
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
        />
      </div>
    </div>
  );
}

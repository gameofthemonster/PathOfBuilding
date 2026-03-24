import { useState } from "react"
import type { Item } from "../types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
}

interface ItemMods {
  implicits: string[]
  explicits: string[]
}

function parseItemMods(rawText: string): ItemMods {
  const lines = rawText.split("\n").map((l) => l.trim())
  let implicitCount = 0
  let pastHeader = false
  const mods: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith("<")) continue
    const m = line.match(/^Implicits:\s*(\d+)$/)
    if (m) {
      implicitCount = parseInt(m[1])
      pastHeader = true
      continue
    }
    if (!pastHeader) continue
    mods.push(decodeEntities(line))
  }

  return {
    implicits: mods.slice(0, implicitCount),
    explicits: mods.slice(implicitCount),
  }
}

const RARITY_COLORS: Record<string, string> = {
  UNIQUE: "text-orange-400",
  RARE: "text-yellow-400",
  MAGIC: "text-blue-400",
  NORMAL: "text-gray-200",
}

const RARITY_MOD_COLORS: Record<string, string> = {
  UNIQUE: "text-orange-300/90",
  RARE: "text-sky-300/90",
  MAGIC: "text-blue-300/90",
  NORMAL: "text-gray-300/80",
}

interface Props {
  slotName: string
  item: Item | null
  onReplace: (rawText: string) => void
}

export function ItemSlot({ slotName, item, onReplace }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  function handleReplace() {
    if (draft.trim()) {
      onReplace(draft.trim())
      setOpen(false)
      setDraft("")
    }
  }

  const mods = item ? parseItemMods(item.rawText) : null
  const modColor = item ? (RARITY_MOD_COLORS[item.rarity] ?? "text-muted-foreground") : ""

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <div className="cursor-pointer rounded border border-border hover:border-primary transition-colors bg-card">
          {/* 头部：插槽名 + 物品名 */}
          <div className="px-2 pt-1 pb-0.5">
            <div className="text-[10px] text-muted-foreground leading-none mb-0.5">{slotName}</div>
            {item ? (
              <>
                <div className={`text-xs font-medium leading-tight ${RARITY_COLORS[item.rarity] ?? ""}`}>
                  {item.name || item.base}
                </div>
                {item.name && item.base && (
                  <div className="text-[10px] text-muted-foreground leading-tight">{item.base}</div>
                )}
              </>
            ) : (
              <div className="text-[10px] text-muted-foreground/50 italic leading-tight">空</div>
            )}
          </div>

          {/* 词缀 */}
          {item && mods && (mods.implicits.length > 0 || mods.explicits.length > 0) && (
            <div className="px-2 pb-1 pt-0.5 border-t border-border/30">
              {mods.implicits.map((mod, i) => (
                <div key={`imp-${i}`} className="text-[10px] text-yellow-300/80 leading-[1.3]">{mod}</div>
              ))}
              {mods.implicits.length > 0 && mods.explicits.length > 0 && (
                <div className="my-0.5 border-t border-border/20" />
              )}
              {mods.explicits.map((mod, i) => (
                <div key={`exp-${i}`} className={`text-[10px] ${modColor} leading-[1.3]`}>{mod}</div>
              ))}
            </div>
          )}
        </div>
      </SheetTrigger>

      <SheetContent side="right" className="w-96">
        <SheetHeader>
          <SheetTitle>替换 {slotName}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 mt-4">
          {item && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">当前装备</div>
              <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-y-auto">
                {item.rawText}
              </pre>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              粘贴新装备文本（游戏内 Ctrl+C 复制）
            </div>
            <Textarea
              className="font-mono text-xs h-48"
              placeholder={"Rarity: UNIQUE\nItem Name\nBase Type\n..."}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button onClick={handleReplace} disabled={!draft.trim()}>
            替换装备
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

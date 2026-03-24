import { useState } from "react"
import type { Item } from "../types"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"

const RARITY_COLORS: Record<string, string> = {
  UNIQUE: "text-orange-400",
  RARE: "text-yellow-400",
  MAGIC: "text-blue-400",
  NORMAL: "text-gray-200",
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{slotName}</span>
              {item && (
                <Badge variant="outline" className="text-xs">
                  {item.rarity}
                </Badge>
              )}
            </div>
            {item ? (
              <div className={`text-sm font-medium ${RARITY_COLORS[item.rarity] ?? ""}`}>
                {item.name || item.base}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">空</div>
            )}
          </CardHeader>
          {item && (
            <CardContent className="py-1 px-3">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-4 max-h-20 overflow-hidden">
                {item.rawText
                  .split("\n")
                  .slice(3)
                  .filter((l) => l.trim() && !l.startsWith("---"))
                  .slice(0, 6)
                  .join("\n")}
              </pre>
            </CardContent>
          )}
        </Card>
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

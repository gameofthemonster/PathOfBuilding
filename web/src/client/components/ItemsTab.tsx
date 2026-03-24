import type { BuildConfig, Item } from "../types"
import { ItemSlot } from "./ItemSlot"

const SLOT_ORDER = [
  "Weapon 1", "Weapon 2",
  "Helmet", "Body Armour", "Gloves", "Boots",
  "Amulet", "Ring 1", "Ring 2", "Belt",
  "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5",
]

const SLOT_LABELS: Record<string, string> = {
  "Weapon 1": "主手武器",
  "Weapon 2": "副手武器",
  "Helmet": "头盔",
  "Body Armour": "胸甲",
  "Gloves": "手套",
  "Boots": "靴子",
  "Amulet": "护身符",
  "Ring 1": "戒指 1",
  "Ring 2": "戒指 2",
  "Belt": "腰带",
  "Flask 1": "药剂 1",
  "Flask 2": "药剂 2",
  "Flask 3": "药剂 3",
  "Flask 4": "药剂 4",
  "Flask 5": "药剂 5",
}

interface Props {
  buildConfig: BuildConfig
  onItemChange: (slotName: string, newItemText: string) => void
}

export function ItemsTab({ buildConfig, onItemChange }: Props) {
  const { itemList, slots } = buildConfig.items

  function getItem(slotName: string): Item | null {
    const itemId = slots[slotName]
    if (!itemId) return null
    return itemList.find((i) => i.id === itemId) ?? null
  }

  return (
    <div className="p-2">
      <div className="grid grid-cols-2 gap-1.5">
        {SLOT_ORDER.map((slotName) => (
          <ItemSlot
            key={slotName}
            slotName={SLOT_LABELS[slotName] ?? slotName}
            item={getItem(slotName)}
            onReplace={(rawText) => onItemChange(slotName, rawText)}
          />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        替换装备后点击页面顶部"重新计算"按钮生效
      </p>
    </div>
  )
}

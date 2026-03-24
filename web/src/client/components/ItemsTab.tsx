import type { BuildConfig, Item } from "../types"
import { ItemSlot } from "./ItemSlot"

const SLOT_ORDER = [
  "Weapon 1", "Weapon 2",
  "Helmet", "Body Armour", "Gloves", "Boots",
  "Amulet", "Ring 1", "Ring 2", "Belt",
  "Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5",
]

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
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        {SLOT_ORDER.map((slotName) => (
          <ItemSlot
            key={slotName}
            slotName={slotName}
            item={getItem(slotName)}
            onReplace={(rawText) => onItemChange(slotName, rawText)}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        替换装备后点击页面顶部"重新计算"按钮生效
      </p>
    </div>
  )
}

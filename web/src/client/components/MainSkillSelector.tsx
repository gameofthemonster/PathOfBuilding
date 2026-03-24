import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SocketGroup } from "../types"

interface Props {
  skills: SocketGroup[]
  mainSocketGroup: number
  onChange: (index: number) => void
}

export function MainSkillSelector({ skills, mainSocketGroup, onChange }: Props) {
  // 过滤有效的技能组（有技能且启用）
  const enabledGroups = skills
    .map((group, i) => ({ group, index: i + 1 }))  // POB 的 mainSocketGroup 从 1 开始
    .filter(({ group }) => group.gems.length > 0)

  if (enabledGroups.length === 0) return null

  // 获取技能组的显示标签
  function getGroupLabel(group: SocketGroup, index: number): string {
    // 优先用主动技能名称
    const activeGem = group.gems.find(g => !g.skillId.includes("Support"))
    const gemName = activeGem?.nameSpec || activeGem?.skillId || ""
    return group.label || gemName || group.slot || `技能组 ${index}`
  }

  return (
    <div className="px-3 py-2 border-b">
      <div className="text-xs text-muted-foreground mb-1">主要技能</div>
      <Select
        value={String(mainSocketGroup)}
        onValueChange={(v) => onChange(parseInt(v, 10))}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {enabledGroups.map(({ group, index }) => (
            <SelectItem key={index} value={String(index)} className="text-xs">
              {getGroupLabel(group, index)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

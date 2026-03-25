import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SocketGroup } from "../types"
import { useI18n } from "../hooks/useI18n"

interface Props {
  skills: SocketGroup[]
  mainSocketGroup: number
  onChange: (index: number) => void
}

export function MainSkillSelector({ skills, mainSocketGroup, onChange }: Props) {
  const { t } = useI18n()

  const enabledGroups = skills
    .map((group, i) => ({ group, index: i + 1 }))
    .filter(({ group }) => group.gems.length > 0)

  if (enabledGroups.length === 0) return null

  function getGroupLabel(group: SocketGroup, index: number): string {
    const activeGem = group.gems.find(g => !g.skillId.includes("Support"))
    const gemName = activeGem ? t(activeGem.nameSpec || activeGem.skillId) : ""
    return (group.label ? t(group.label) : "") || gemName || (group.slot ? t(group.slot) : "") || `技能组 ${index}`
  }

  return (
    <div className="px-3 py-2 border-b">
      <div className="text-xs text-muted-foreground mb-1">主要技能 <span className="text-[10px] text-muted-foreground/50">Main Skill</span></div>
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

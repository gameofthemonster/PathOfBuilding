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
  skillParts?: string[]
  skillPartIndex?: number
  onSkillPartChange?: (partIndex: number) => void
}

export function MainSkillSelector({ skills, mainSocketGroup, onChange, skillParts, skillPartIndex, onSkillPartChange }: Props) {
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
    <div className="px-3 py-2 border-b flex flex-col gap-1.5">
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          技能组 <span className="text-[10px] text-muted-foreground/50">Socket Group</span>
        </div>
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

      {skillParts && skillParts.length > 1 && onSkillPartChange && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            主动技能 <span className="text-[10px] text-muted-foreground/50">Active Skill</span>
          </div>
          <Select
            value={String(skillPartIndex ?? 1)}
            onValueChange={(v) => onSkillPartChange(parseInt(v, 10))}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {skillParts.map((name, i) => (
                <SelectItem key={i} value={String(i + 1)} className="text-xs">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

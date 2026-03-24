import type { BuildConfig, GemInstance } from "../types"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface GemRowProps {
  gem: GemInstance
  onChange: (updated: Partial<GemInstance>) => void
}

function GemRow({ gem, onChange }: GemRowProps) {
  const isSupport = gem.skillId.startsWith("Support") || gem.skillId.includes("Support")
  const GEM_COLOR = isSupport ? "bg-blue-900" : "bg-red-900"
  return (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-0">
      <Switch
        checked={gem.enabled}
        onCheckedChange={(enabled) => onChange({ enabled })}
        className="h-4 w-7"
      />
      <span className={`text-xs px-1 rounded ${GEM_COLOR}`}>
        {gem.nameSpec || gem.skillId}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <Label className="text-xs text-muted-foreground">Lv</Label>
        <Input
          type="number"
          min={1}
          max={23}
          value={gem.level}
          onChange={(e) => onChange({ level: parseInt(e.target.value, 10) })}
          className="w-12 h-6 text-xs text-center px-1"
        />
        <Label className="text-xs text-muted-foreground">Q</Label>
        <Input
          type="number"
          min={0}
          max={23}
          value={gem.quality}
          onChange={(e) => onChange({ quality: parseInt(e.target.value, 10) })}
          className="w-12 h-6 text-xs text-center px-1"
        />
      </div>
    </div>
  )
}

interface Props {
  buildConfig: BuildConfig
  onSkillChange: (groupIndex: number, gemIndex: number, updated: Partial<GemInstance>) => void
}

export function SkillsTab({ buildConfig, onSkillChange }: Props) {
  return (
    <div className="p-4 flex flex-col gap-3">
      {buildConfig.skills.map((group, gi) => (
        <Card key={gi}>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {group.label || group.slot || `组 ${gi + 1}`}
              </span>
              {group.slot && (
                <Badge variant="outline" className="text-xs">{group.slot}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="py-1 px-3">
            {group.gems.map((gem, ji) => (
              <GemRow
                key={ji}
                gem={gem}
                onChange={(updated) => onSkillChange(gi, ji, updated)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

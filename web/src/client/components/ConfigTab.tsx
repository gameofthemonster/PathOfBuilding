import type { BuildConfig } from "../types"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CONFIG_DISPLAY: Array<{
  key: string
  label: string
  type: "boolean" | "number" | "select"
  options?: string[]
}> = [
  { key: "enemyIsBoss", label: "目标为 Boss", type: "boolean" },
  { key: "enemyIsUnique", label: "目标为稀有", type: "boolean" },
  { key: "conditionFullLife", label: "满生命值", type: "boolean" },
  { key: "conditionFullEnergyShield", label: "满 ES", type: "boolean" },
  { key: "conditionLowLife", label: "低生命值", type: "boolean" },
  { key: "conditionLowMana", label: "低法力", type: "boolean" },
  { key: "conditionMoving", label: "移动中", type: "boolean" },
  { key: "conditionOnFlask", label: "喝瓶中", type: "boolean" },
  { key: "buffFrenzyCharges", label: "狂热充能", type: "number" },
  { key: "buffPowerCharges", label: "能量充能", type: "number" },
  { key: "buffEnduranceCharges", label: "耐力充能", type: "number" },
  { key: "buffRage", label: "暴怒值", type: "number" },
]

interface Props {
  buildConfig: BuildConfig
  onConfigChange: (key: string, value: unknown) => void
}

export function ConfigTab({ buildConfig, onConfigChange }: Props) {
  const config = buildConfig.config

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="text-xs text-muted-foreground mb-2">
        常用配置选项（仅展示部分，完整选项需查看 POB）
      </div>
      {CONFIG_DISPLAY.map(({ key, label, type, options }) => {
        const value = config[key]
        return (
          <div key={key} className="flex items-center justify-between py-1 border-b last:border-0">
            <Label className="text-sm">{label}</Label>
            {type === "boolean" && (
              <Switch
                checked={value === "true" || value === true}
                onCheckedChange={(v) => onConfigChange(key, v)}
              />
            )}
            {type === "number" && (
              <Input
                type="number"
                min={0}
                value={String(value ?? 0)}
                onChange={(e) => onConfigChange(key, parseFloat(e.target.value))}
                className="w-20 h-7 text-xs text-center"
              />
            )}
            {type === "select" && options && (
              <Select
                value={String(value ?? "")}
                onValueChange={(v) => onConfigChange(key, v)}
              >
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )
      })}
    </div>
  )
}

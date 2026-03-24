import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BuildConfig, CalcResult, GemInstance } from "../types"
import { ItemsTab } from "./ItemsTab"
import { SkillsTab } from "./SkillsTab"
import { ConfigTab } from "./ConfigTab"
import { PassiveTreeTab } from "./PassiveTreeTab"

interface Props {
  buildConfig: BuildConfig | null
  result: CalcResult | null
  onItemChange: (slotName: string, newItemText: string) => void
  onSkillChange: (groupIndex: number, gemIndex: number, updated: Partial<GemInstance>) => void
  onConfigChange: (key: string, value: unknown) => void
  onAllocChange?: (allocNodes: number[]) => void
}

export function TabsArea({ buildConfig, result, onItemChange, onSkillChange, onConfigChange, onAllocChange }: Props) {
  return (
    <Tabs defaultValue="stats" className="flex-1 flex flex-col">
      <TabsList className="w-full justify-start border-b rounded-none h-9 px-4 shrink-0">
        <TabsTrigger value="stats">统计</TabsTrigger>
        <TabsTrigger value="items" disabled={!buildConfig}>装备</TabsTrigger>
        <TabsTrigger value="skills" disabled={!buildConfig}>技能</TabsTrigger>
        <TabsTrigger value="tree" disabled={!buildConfig}>天赋树</TabsTrigger>
        <TabsTrigger value="config" disabled={!buildConfig}>配置</TabsTrigger>
      </TabsList>
      <TabsContent value="stats" className="flex-1 p-4 overflow-y-auto">
        {result ? (
          <div className="text-sm text-muted-foreground">
            已计算 {Object.keys(result.stats).length} 个数值
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            请输入 Build String 并点击计算
          </div>
        )}
      </TabsContent>
      <TabsContent value="items" className="p-4 overflow-y-auto flex-1">
        {buildConfig ? (
          <ItemsTab buildConfig={buildConfig} onItemChange={onItemChange} />
        ) : (
          <div className="text-sm text-muted-foreground">装备（Phase 2）</div>
        )}
      </TabsContent>
      <TabsContent value="skills" className="p-4 overflow-y-auto flex-1">
        {buildConfig ? (
          <SkillsTab buildConfig={buildConfig} onSkillChange={onSkillChange} />
        ) : (
          <div className="text-sm text-muted-foreground">技能（Phase 3）</div>
        )}
      </TabsContent>
      <TabsContent value="tree" className="p-0 flex-1">
        {buildConfig ? (
          <PassiveTreeTab buildConfig={buildConfig} onAllocChange={onAllocChange ?? undefined} />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">天赋树（Phase 4）</div>
        )}
      </TabsContent>
      <TabsContent value="config" className="p-4 overflow-y-auto flex-1">
        {buildConfig ? (
          <ConfigTab buildConfig={buildConfig} onConfigChange={onConfigChange} />
        ) : (
          <div className="text-sm text-muted-foreground">配置（Phase 3）</div>
        )}
      </TabsContent>
    </Tabs>
  )
}

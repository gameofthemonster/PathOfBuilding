import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BuildConfig, CalcResult, GemInstance } from "../types"
import { ItemsTab } from "./ItemsTab"
import { SkillsTab } from "./SkillsTab"
import { ConfigTab } from "./ConfigTab"
import { PassiveTreeTab } from "./PassiveTreeTab"
import { CalcsTab } from "./CalcsTab"

interface Props {
  buildConfig: BuildConfig | null
  result: CalcResult | null
  onItemChange: (slotName: string, newItemText: string) => void
  onSkillChange: (groupIndex: number, gemIndex: number, updated: Partial<GemInstance>) => void
  onConfigChange: (key: string, value: unknown) => void
  onAllocChange?: (allocNodes: number[]) => void
}

const VALID_TABS = ["stats", "items", "skills", "tree", "config"]
const TABS_REQUIRING_BUILD = ["items", "skills", "tree", "config"]

export function TabsArea({ buildConfig, result, onItemChange, onSkillChange, onConfigChange, onAllocChange }: Props) {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    if (tab && VALID_TABS.includes(tab)) {
      // 如果 buildConfig 还没加载，非 stats tab 先 fallback 到 stats
      if (TABS_REQUIRING_BUILD.includes(tab) && !buildConfig) {
        return "stats"
      }
      return tab
    }
    return "stats"
  })

  useEffect(() => {
    if (!buildConfig) return
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    if (tab && VALID_TABS.includes(tab) && TABS_REQUIRING_BUILD.includes(tab) && activeTab === "stats") {
      setActiveTab(tab)
    }
  }, [buildConfig])

  function handleTabChange(value: string) {
    setActiveTab(value)
    const params = new URLSearchParams(window.location.search)
    params.set("tab", value)
    history.pushState({}, "", "?" + params.toString())
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
      <TabsList className="w-full justify-start border-b rounded-none h-9 px-4 shrink-0">
        <TabsTrigger value="stats">统计 <span className="text-xs text-muted-foreground/60 font-normal ml-0.5">Calcs</span></TabsTrigger>
        <TabsTrigger value="items" disabled={!buildConfig}>装备 <span className="text-xs text-muted-foreground/60 font-normal ml-0.5">Items</span></TabsTrigger>
        <TabsTrigger value="skills" disabled={!buildConfig}>技能 <span className="text-xs text-muted-foreground/60 font-normal ml-0.5">Skills</span></TabsTrigger>
        <TabsTrigger value="tree" disabled={!buildConfig}>天赋树 <span className="text-xs text-muted-foreground/60 font-normal ml-0.5">Tree</span></TabsTrigger>
        <TabsTrigger value="config" disabled={!buildConfig}>配置 <span className="text-xs text-muted-foreground/60 font-normal ml-0.5">Config</span></TabsTrigger>
      </TabsList>
      <TabsContent value="stats" className="flex-1 overflow-y-auto min-h-0">
        {result ? (
          <CalcsTab result={result} />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            请输入 Build String 并点击计算
          </div>
        )}
      </TabsContent>
      <TabsContent value="items" className="flex-1 min-h-0 p-0 overflow-hidden">
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

import { useState, useEffect } from "react"
import { BuildInput } from "./components/BuildInput"
import { StatsPanel } from "./components/StatsPanel"
import { WarningsPanel } from "./components/WarningsPanel"
import { TabsArea } from "./components/TabsArea"
import { useCalculate } from "./hooks/useCalculate"
import { useRecalculate, type BuildPatch } from "./hooks/useRecalculate"
import { Button } from "@/components/ui/button"
import type { BuildConfig, CalcResult, GemInstance } from "./types"

export default function App() {
  const { loading, error, data, calculate } = useCalculate()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentBuildConfig, setCurrentBuildConfig] = useState<BuildConfig | null>(null)
  const [currentResult, setCurrentResult] = useState<CalcResult | null>(null)
  const [pendingPatch, setPendingPatch] = useState<BuildPatch | null>(null)

  // Sync state when calculate returns new data
  useEffect(() => {
    if (data) {
      setSessionId(data.sessionId)
      setCurrentBuildConfig(data.buildConfig)
      setCurrentResult(data.result)
      setPendingPatch(null)
    }
  }, [data])

  const { loading: recalcLoading, error: recalcError, recalculate } = useRecalculate(
    sessionId,
    (result) => {
      setCurrentResult(result)
      setPendingPatch(null)
    }
  )

  function handleItemChange(slotName: string, newItemText: string) {
    if (!currentBuildConfig) return

    // Generate a new item id (use max existing id + 1)
    const existingIds = currentBuildConfig.items.itemList.map((i) => i.id)
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1

    // Update local buildConfig for display
    const existingSlotItemId = currentBuildConfig.items.slots[slotName]
    let newItemList = currentBuildConfig.items.itemList.filter(
      (i) => i.id !== existingSlotItemId
    )
    const newItem = { id: newId, rawText: newItemText, name: "", base: "", rarity: "" }
    newItemList = [...newItemList, newItem]
    const newSlots = { ...currentBuildConfig.items.slots, [slotName]: newId }

    setCurrentBuildConfig({
      ...currentBuildConfig,
      items: { itemList: newItemList, slots: newSlots },
    })

    // Accumulate patch
    setPendingPatch((prev) => {
      const prevItemList = prev?.items?.itemList ?? []
      const prevSlots = prev?.items?.slots ?? {}
      // Remove any previous patch entry for this slot's old id
      const filteredPrevItems = prevItemList.filter(
        (i) => i.id !== (prev?.items?.slots?.[slotName])
      )
      return {
        ...prev,
        items: {
          itemList: [...filteredPrevItems, { id: newId, rawText: newItemText }],
          slots: { ...prevSlots, [slotName]: newId },
        },
      }
    })
  }

  function handleSkillChange(groupIndex: number, gemIndex: number, updated: Partial<GemInstance>) {
    if (!currentBuildConfig) return

    const newSkills = currentBuildConfig.skills.map((group, gi) => {
      if (gi !== groupIndex) return group
      return {
        ...group,
        gems: group.gems.map((gem, ji) => {
          if (ji !== gemIndex) return gem
          return { ...gem, ...updated }
        }),
      }
    })

    setCurrentBuildConfig({ ...currentBuildConfig, skills: newSkills })

    // Build patch in the format expected by BuildPatch.skills
    const gemPatch: { index: number; level?: number; quality?: number; enabled?: boolean } = {
      index: gemIndex,
    }
    if (updated.level !== undefined) gemPatch.level = updated.level
    if (updated.quality !== undefined) gemPatch.quality = updated.quality
    if (updated.enabled !== undefined) gemPatch.enabled = updated.enabled

    setPendingPatch((prev) => {
      const existingSkills = prev?.skills ?? []
      const existingGroupPatch = existingSkills.find((s) => s.index === groupIndex)
      const otherSkillPatches = existingSkills.filter((s) => s.index !== groupIndex)
      const existingGems = existingGroupPatch?.gems ?? []
      const filteredGems = existingGems.filter((g) => g.index !== gemIndex)
      return {
        ...prev,
        skills: [
          ...otherSkillPatches,
          { index: groupIndex, gems: [...filteredGems, gemPatch] },
        ],
      }
    })
  }

  function handleConfigChange(key: string, value: unknown) {
    if (!currentBuildConfig) return

    const newConfig = { ...currentBuildConfig.config, [key]: value }
    setCurrentBuildConfig({ ...currentBuildConfig, config: newConfig })

    setPendingPatch((prev) => ({
      ...prev,
      config: newConfig,
    }))
  }

  const isLoading = loading || recalcLoading
  const displayError = error ?? recalcError

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b shrink-0">
        <BuildInput onCalculate={calculate} loading={isLoading} />
        {displayError && (
          <div className="px-4 pb-2 text-sm text-destructive">{displayError}</div>
        )}
        {pendingPatch && sessionId && (
          <div className="px-4 pb-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">有未应用的装备变更</span>
            <Button
              size="sm"
              variant="default"
              disabled={recalcLoading}
              onClick={() => recalculate(pendingPatch)}
            >
              {recalcLoading ? "计算中..." : "重新计算"}
            </Button>
          </div>
        )}
      </header>

      {/* 主体：左栏 + 右内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：Stats + Warnings（固定宽度，独立滚动） */}
        <aside className="w-64 border-r overflow-y-auto shrink-0">
          {currentResult ? (
            <>
              <StatsPanel result={currentResult} />
              <WarningsPanel result={currentResult} />
            </>
          ) : (
            <div className="p-4 text-xs text-muted-foreground">
              {isLoading ? "计算中..." : "等待 Build 数据"}
            </div>
          )}
        </aside>

        {/* 右侧：Tab 内容区 */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <TabsArea
            buildConfig={currentBuildConfig}
            result={currentResult}
            onItemChange={handleItemChange}
            onSkillChange={handleSkillChange}
            onConfigChange={handleConfigChange}
          />
        </main>
      </div>
    </div>
  )
}

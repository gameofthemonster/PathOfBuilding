import { BuildInput } from "./components/BuildInput"
import { StatsPanel } from "./components/StatsPanel"
import { WarningsPanel } from "./components/WarningsPanel"
import { TabsArea } from "./components/TabsArea"
import { useCalculate } from "./hooks/useCalculate"

export default function App() {
  const { loading, error, data, calculate } = useCalculate()

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b shrink-0">
        <BuildInput onCalculate={calculate} loading={loading} />
        {error && (
          <div className="px-4 pb-2 text-sm text-destructive">{error}</div>
        )}
      </header>

      {/* 主体：左栏 + 右内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：Stats + Warnings（固定宽度，独立滚动） */}
        <aside className="w-64 border-r overflow-y-auto shrink-0">
          {data?.result ? (
            <>
              <StatsPanel result={data.result} />
              <WarningsPanel result={data.result} />
            </>
          ) : (
            <div className="p-4 text-xs text-muted-foreground">
              {loading ? "计算中..." : "等待 Build 数据"}
            </div>
          )}
        </aside>

        {/* 右侧：Tab 内容区 */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <TabsArea
            buildConfig={data?.buildConfig ?? null}
            result={data?.result ?? null}
          />
        </main>
      </div>
    </div>
  )
}

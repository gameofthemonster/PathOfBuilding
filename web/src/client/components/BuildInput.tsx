import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { SpinnerGap } from "@phosphor-icons/react"

interface Props {
  onCalculate: (buildCode: string) => Promise<void>
  loading: boolean
}

export function BuildInput({ onCalculate, loading }: Props) {
  const [value, setValue] = useState("")
  const [fixtures, setFixtures] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => r.json())
      .then((d) => setFixtures(d.fixtures ?? []))
      .catch(() => {})
  }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onCalculate(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit()
    }
  }

  const loadFixture = async (name: string) => {
    const res = await fetch(`/api/fixtures/${encodeURIComponent(name)}`)
    if (!res.ok) return
    const code = await res.text()
    setValue(code)
    onCalculate(code)
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {fixtures.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground self-center mr-1">Fixtures:</span>
          {fixtures.map((name) => (
            <button
              key={name}
              onClick={() => loadFixture(name)}
              disabled={loading}
              className="px-2 py-0.5 text-xs rounded border border-input bg-muted hover:bg-accent hover:text-accent-foreground disabled:opacity-50 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <textarea
          className="flex-1 min-h-[60px] max-h-[120px] resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="粘贴 POB Build String..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <Button
          onClick={handleSubmit}
          disabled={loading || !value.trim()}
          className="shrink-0"
        >
          {loading ? (
            <>
              <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />
              计算中
            </>
          ) : (
            "计算"
          )}
        </Button>
      </div>
    </div>
  )
}

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface Props {
  onCalculate: (buildCode: string) => Promise<void>
  loading: boolean
}

export function BuildInput({ onCalculate, loading }: Props) {
  const [value, setValue] = useState("")

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

  return (
    <div className="flex items-start gap-2 p-4">
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            计算中
          </>
        ) : (
          "计算"
        )}
      </Button>
    </div>
  )
}

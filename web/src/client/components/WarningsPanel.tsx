import { AlertTriangle } from "lucide-react"
import type { CalcResult } from "../types"

interface Props {
  result: CalcResult
}

export function WarningsPanel({ result }: Props) {
  if (result.warnings.length === 0) return null

  return (
    <div className="p-3 border-t">
      <div className="text-xs font-semibold uppercase tracking-wide text-yellow-500 mb-2">
        警告
      </div>
      <ul className="flex flex-col gap-1">
        {result.warnings.map((msg, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-yellow-500">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{msg}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

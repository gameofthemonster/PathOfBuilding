import { Warning as AlertTriangle } from "@phosphor-icons/react"
import type { CalcResult } from "../types"
import { useI18n } from "../hooks/useI18n"

interface Props {
  result: CalcResult
}

export function WarningsPanel({ result }: Props) {
  const { t } = useI18n()

  if (result.warnings.length === 0) return null

  return (
    <div className="p-3 border-t">
      <div className="text-xs font-semibold uppercase tracking-wide text-yellow-500 mb-2">
        警告 <span className="text-[10px] text-yellow-500/50 font-normal normal-case tracking-normal">Warnings</span>
      </div>
      <ul className="flex flex-col gap-1">
        {result.warnings.map((msg, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-yellow-500">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{t(msg)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

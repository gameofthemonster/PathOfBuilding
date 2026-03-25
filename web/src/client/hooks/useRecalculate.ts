import { useState } from "react"
import type { BuildConfig, CalcResult } from "../types"

export interface BuildPatch {
  items?: {
    itemList?: Array<{ id: number; rawText: string }>
    slots?: Record<string, number>
  }
  tree?: {
    allocNodes?: number[]
    classId?: number
    ascendClassId?: number
  }
  skills?: Array<{
    index: number
    gems?: Array<{ index: number; level?: number; quality?: number; enabled?: boolean; skillPart?: number }>
  }>
  config?: Record<string, unknown>
}

interface RecalcState {
  loading: boolean
  error: string | null
}

export function useRecalculate(
  sessionId: string | null,
  onResult: (result: CalcResult, buildConfig?: BuildConfig) => void
) {
  const [state, setState] = useState<RecalcState>({ loading: false, error: null })

  async function recalculate(patch: BuildPatch) {
    if (!sessionId) return
    setState({ loading: true, error: null })
    try {
      const res = await fetch("/api/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, patch }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Recalculate failed")
      }
      const data = await res.json()
      onResult(data.result, data.buildConfig)
      setState({ loading: false, error: null })
    } catch (e) {
      setState({ loading: false, error: String(e) })
    }
  }

  return { ...state, recalculate }
}

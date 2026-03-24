import { useState, useCallback } from "react"
import type { CalculateResponse } from "../types"

interface UseCalculateState {
  loading: boolean
  error: string | null
  data: CalculateResponse | null
}

interface UseCalculateReturn extends UseCalculateState {
  calculate: (buildCode: string) => Promise<void>
  sessionId: string | null
}

export function useCalculate(): UseCalculateReturn {
  const [state, setState] = useState<UseCalculateState>({
    loading: false,
    error: null,
    data: null,
  })

  const calculate = useCallback(async (buildCode: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildCode: buildCode.trim() }),
      })

      const json = await res.json()

      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: json.error ?? `Server error: ${res.status}`,
        }))
        return
      }

      setState({
        loading: false,
        error: null,
        data: json as CalculateResponse,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: `Network error: ${String(err)}`,
      }))
    }
  }, [])

  return {
    ...state,
    calculate,
    sessionId: state.data?.sessionId ?? null,
  }
}

import { useState, useCallback } from "react";
export function useCalculate() {
    const [state, setState] = useState({
        loading: false,
        error: null,
        data: null,
    });
    const calculate = useCallback(async (buildCode) => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const res = await fetch("/api/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ buildCode: buildCode.trim() }),
            });
            const json = await res.json();
            if (!res.ok) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: json.error ?? `Server error: ${res.status}`,
                }));
                return;
            }
            setState({
                loading: false,
                error: null,
                data: json,
            });
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                loading: false,
                error: `Network error: ${String(err)}`,
            }));
        }
    }, []);
    return {
        ...state,
        calculate,
        sessionId: state.data?.sessionId ?? null,
    };
}

import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { BuildInput } from "./components/BuildInput";
import { StatsPanel } from "./components/StatsPanel";
import { WarningsPanel } from "./components/WarningsPanel";
import { TabsArea } from "./components/TabsArea";
import { useCalculate } from "./hooks/useCalculate";
export default function App() {
    const { loading, error, data, calculate } = useCalculate();
    return (_jsxs("div", { className: "flex flex-col h-screen bg-background text-foreground", children: [_jsxs("header", { className: "border-b shrink-0", children: [_jsx(BuildInput, { onCalculate: calculate, loading: loading }), error && (_jsx("div", { className: "px-4 pb-2 text-sm text-destructive", children: error }))] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx("aside", { className: "w-64 border-r overflow-y-auto shrink-0", children: data?.result ? (_jsxs(_Fragment, { children: [_jsx(StatsPanel, { result: data.result }), _jsx(WarningsPanel, { result: data.result })] })) : (_jsx("div", { className: "p-4 text-xs text-muted-foreground", children: loading ? "计算中..." : "等待 Build 数据" })) }), _jsx("main", { className: "flex-1 overflow-hidden flex flex-col", children: _jsx(TabsArea, { buildConfig: data?.buildConfig ?? null, result: data?.result ?? null }) })] })] }));
}

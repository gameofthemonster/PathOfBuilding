import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle } from "lucide-react";
export function WarningsPanel({ result }) {
    if (result.warnings.length === 0)
        return null;
    return (_jsxs("div", { className: "p-3 border-t", children: [_jsx("div", { className: "text-xs font-semibold uppercase tracking-wide text-yellow-500 mb-2", children: "\u8B66\u544A" }), _jsx("ul", { className: "flex flex-col gap-1", children: result.warnings.map((msg, i) => (_jsxs("li", { className: "flex items-start gap-1.5 text-xs text-yellow-500", children: [_jsx(AlertTriangle, { className: "h-3 w-3 mt-0.5 shrink-0" }), _jsx("span", { children: msg })] }, i))) })] }));
}

import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
export function BuildInput({ onCalculate, loading }) {
    const [value, setValue] = useState("");
    const handleSubmit = () => {
        const trimmed = value.trim();
        if (!trimmed)
            return;
        onCalculate(trimmed);
    };
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            handleSubmit();
        }
    };
    return (_jsxs("div", { className: "flex items-start gap-2 p-4", children: [_jsx("textarea", { className: "flex-1 min-h-[60px] max-h-[120px] resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", placeholder: "\u7C98\u8D34 POB Build String...", value: value, onChange: (e) => setValue(e.target.value), onKeyDown: handleKeyDown, disabled: loading }), _jsx(Button, { onClick: handleSubmit, disabled: loading || !value.trim(), className: "shrink-0", children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u8BA1\u7B97\u4E2D"] })) : ("计算") })] }));
}

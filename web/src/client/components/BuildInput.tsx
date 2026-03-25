import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SpinnerGap, CaretDown, CaretUp } from "@phosphor-icons/react";
import { X } from "lucide-react";

interface Props {
  onCalculate: (buildCode: string) => Promise<void>;
  loading: boolean;
}

export function BuildInput({ onCalculate, loading }: Props) {
  const [value, setValue] = useState("");
  const [fixtures, setFixtures] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/fixtures")
      .then((r) => r.json())
      .then((d) => setFixtures(d.fixtures ?? []))
      .catch(() => {});
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onCalculate(trimmed).then(() => setOpen(false));
  };

  const loadFixture = useCallback(
    async (name: string) => {
      const res = await fetch(`/api/fixtures/${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const code = await res.text();
      setValue(code);
      onCalculate(code).then(() => setOpen(false));
      const params = new URLSearchParams(window.location.search);
      params.set("fixture", name);
      history.pushState({}, "", "?" + params.toString());
    },
    [onCalculate],
  );

  // 挂载时自动从 URL 加载 fixture
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fixtureName = params.get("fixture");
    if (fixtureName) {
      loadFixture(fixtureName);
    }
  }, [loadFixture]);

  return (
    <div className="flex flex-col">
      {/* 折叠触发行 */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setOpen((v) => !v)}
          disabled={loading}
        >
          导入 Build
          {loading ? (
            <SpinnerGap className="h-3.5 w-3.5 animate-spin" />
          ) : open ? (
            <CaretUp className="h-3.5 w-3.5" />
          ) : (
            <CaretDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* 可折叠内容 */}
      {open && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {fixtures.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground self-center mr-1">
                Fixtures:
              </span>
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
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-2 pr-7 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                placeholder="粘贴 POB Build String..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                disabled={loading}
              />
              {value && (
                <button
                  onClick={() => setValue("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={loading || !value.trim()}
              className="shrink-0"
            >
              {loading ? (
                <>
                  导入中
                  <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />
                </>
              ) : (
                "导入"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

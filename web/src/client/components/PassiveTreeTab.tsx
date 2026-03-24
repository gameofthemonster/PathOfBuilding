import { useRef, useEffect, useCallback } from "react"
import type { BuildConfig } from "../types"
import { usePassiveTree } from "../hooks/usePassiveTree"

const NODE_RADIUS: Record<string, number> = {
  keystone: 24,
  notable: 14,
  normal: 8,
  socket: 12,
  mastery: 16,
  ascendancy: 12,
}

const NODE_COLOR: Record<string, string> = {
  keystone: "#b8860b",
  notable: "#4a90d9",
  normal: "#888",
  socket: "#9c27b0",
  mastery: "#555",
  ascendancy: "#c0a060",
}

const ALLOCATED_COLOR = "#ffd700"

interface Props {
  buildConfig: BuildConfig
  onAllocChange?: (allocNodes: number[]) => void
}

export function PassiveTreeTab({ buildConfig, onAllocChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  })
  const viewRef = useRef({ scale: 0.15, offsetX: 0, offsetY: 0 })

  const { nodes, allocated, toggleNode } = usePassiveTree(buildConfig.tree.allocNodes)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext("2d")!
    const { scale, offsetX, offsetY } = viewRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (const node of nodes) {
      if (node.ascendancyName) continue
      const sx = node.x * scale + offsetX
      const sy = node.y * scale + offsetY
      if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue

      const r = (NODE_RADIUS[node.type] ?? 8) * scale
      const isAlloc = allocated.has(node.id)

      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(r, 2), 0, Math.PI * 2)
      ctx.fillStyle = isAlloc ? ALLOCATED_COLOR : (NODE_COLOR[node.type] ?? "#888")
      ctx.fill()
      if (isAlloc) {
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }, [nodes, allocated])

  useEffect(() => {
    draw()
  }, [draw])

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return
    viewRef.current.offsetX += e.clientX - dragRef.current.lastX
    viewRef.current.offsetY += e.clientY - dragRef.current.lastY
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY
    draw()
  }
  function onMouseUp() {
    dragRef.current.dragging = false
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    viewRef.current.scale *= e.deltaY < 0 ? 1.1 : 0.9
    draw()
  }

  function onClick(e: React.MouseEvent) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { scale, offsetX, offsetY } = viewRef.current

    for (const node of nodes) {
      if (node.ascendancyName) continue
      const sx = node.x * scale + offsetX
      const sy = node.y * scale + offsetY
      const r = (NODE_RADIUS[node.type] ?? 8) * scale
      if (Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) <= Math.max(r, 6)) {
        toggleNode(node.id)
        const newAlloc = new Set(allocated)
        if (newAlloc.has(node.id)) newAlloc.delete(node.id)
        else newAlloc.add(node.id)
        onAllocChange?.(Array.from(newAlloc))
        return
      }
    }
  }

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 120px)" }}>
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ background: "#1a1a2e" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onClick}
      />
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">
        已分配 {allocated.size} 节点 · 拖拽平移 · 滚轮缩放
      </div>
    </div>
  )
}

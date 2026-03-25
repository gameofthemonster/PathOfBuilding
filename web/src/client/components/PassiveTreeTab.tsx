import { useRef, useEffect, useCallback } from "react"
import type { BuildConfig } from "../types"
import { usePassiveTree } from "../hooks/usePassiveTree"

// Node radii in world-coordinate units
const NODE_RADIUS: Record<string, number> = {
  keystone: 24,
  notable: 14,
  normal: 8,
  socket: 12,
  mastery: 12,
  ascendancy: 12,
}

// Minimum screen-pixel radius so nodes remain distinguishable at low zoom
const NODE_MIN_RADIUS: Record<string, number> = {
  keystone: 5,
  notable: 3.5,
  normal: 2,
  socket: 3,
  mastery: 2.5,
  ascendancy: 3,
}

// Unallocated node fill colors (poe.ninja style: dim, type-differentiated)
const NODE_COLOR: Record<string, string> = {
  keystone: "#8b6914",
  notable: "#2a6099",
  normal: "#555",
  socket: "#6a3a8a",
  mastery: "#3a3a3a",
  ascendancy: "#7a6030",
}

const ALLOCATED_COLOR = "#ffd700"
const LINE_UNALLOC = "rgba(120,120,120,0.35)"
const LINE_ALLOC = "rgba(255,200,50,0.75)"

interface Props {
  buildConfig: BuildConfig
  onAllocChange?: (allocNodes: number[]) => void
}

export function PassiveTreeTab({ buildConfig, onAllocChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false, lastX: 0, lastY: 0,
  })
  const viewRef = useRef({ scale: 0.25, offsetX: 0, offsetY: 0 })
  const initializedRef = useRef(false)

  const { nodes, allocated, toggleNode } = usePassiveTree(buildConfig.tree.allocNodes)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext("2d")!
    const { scale } = viewRef.current

    // On first draw, center view on allocated nodes (or tree center)
    if (!initializedRef.current) {
      initializedRef.current = true
      const allocList = nodes.filter(n => !n.ascendancyName && allocated.has(n.id))
      const source = allocList.length > 0 ? allocList : nodes.filter(n => !n.ascendancyName)
      if (source.length > 0) {
        const cx = source.reduce((s, n) => s + n.x, 0) / source.length
        const cy = source.reduce((s, n) => s + n.y, 0) / source.length
        viewRef.current.offsetX = canvas.width / 2 - cx * scale
        viewRef.current.offsetY = canvas.height / 2 - cy * scale
      }
    }

    const { offsetX: ox, offsetY: oy } = viewRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#0e0e17"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Build a lookup map for edges
    const nodeMap = new Map<number, { x: number; y: number; ascendancyName?: string }>()
    for (const n of nodes) {
      nodeMap.set(n.id, { x: n.x, y: n.y, ascendancyName: n.ascendancyName })
    }

    const pad = 80
    const inView = (wx: number, wy: number) => {
      const sx = wx * scale + ox
      const sy = wy * scale + oy
      return sx >= -pad && sx <= canvas.width + pad && sy >= -pad && sy <= canvas.height + pad
    }

    // Pass 1: unallocated edges (grey)
    ctx.lineWidth = Math.max(0.5, scale * 1.5)
    ctx.strokeStyle = LINE_UNALLOC
    ctx.beginPath()
    for (const node of nodes) {
      if (node.ascendancyName) continue
      if (!node.out || node.out.length === 0) continue
      for (const toId of node.out) {
        const toNode = nodeMap.get(toId)
        if (!toNode || toNode.ascendancyName) continue
        // skip if both endpoints are allocated (drawn in pass 2)
        if (allocated.has(node.id) && allocated.has(toId)) continue
        if (!inView(node.x, node.y) && !inView(toNode.x, toNode.y)) continue
        ctx.moveTo(node.x * scale + ox, node.y * scale + oy)
        ctx.lineTo(toNode.x * scale + ox, toNode.y * scale + oy)
      }
    }
    ctx.stroke()

    // Pass 2: allocated edges (gold) — draw on top
    ctx.lineWidth = Math.max(1, scale * 2.5)
    ctx.strokeStyle = LINE_ALLOC
    ctx.beginPath()
    for (const node of nodes) {
      if (node.ascendancyName) continue
      if (!allocated.has(node.id)) continue
      if (!node.out || node.out.length === 0) continue
      for (const toId of node.out) {
        if (!allocated.has(toId)) continue
        const toNode = nodeMap.get(toId)
        if (!toNode || toNode.ascendancyName) continue
        if (!inView(node.x, node.y) && !inView(toNode.x, toNode.y)) continue
        ctx.moveTo(node.x * scale + ox, node.y * scale + oy)
        ctx.lineTo(toNode.x * scale + ox, toNode.y * scale + oy)
      }
    }
    ctx.stroke()

    const visibleNodes = nodes.filter(node => {
      if (node.ascendancyName) return false
      return inView(node.x, node.y)
    })

    // Pass 3: unallocated nodes
    for (const node of visibleNodes) {
      if (allocated.has(node.id)) continue
      const sx = node.x * scale + ox
      const sy = node.y * scale + oy
      const minR = NODE_MIN_RADIUS[node.type] ?? 2
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * scale, minR)

      if (node.type === "keystone") {
        // Keystones: diamond/octagon outline
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = NODE_COLOR[node.type]
        ctx.fill()
        ctx.strokeStyle = "#6a5010"
        ctx.lineWidth = Math.max(0.5, scale)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = NODE_COLOR[node.type] ?? "#555"
        ctx.fill()
      }
    }

    // Pass 4: allocated nodes (gold + glow)
    for (const node of visibleNodes) {
      if (!allocated.has(node.id)) continue
      const sx = node.x * scale + ox
      const sy = node.y * scale + oy
      const minR = NODE_MIN_RADIUS[node.type] ?? 2
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * scale, minR)

      // Outer glow
      const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 2.5)
      glow.addColorStop(0, "rgba(255,200,50,0.3)")
      glow.addColorStop(1, "rgba(255,200,50,0)")
      ctx.beginPath()
      ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.fill()

      // Node fill
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fillStyle = ALLOCATED_COLOR
      ctx.fill()
      ctx.strokeStyle = "#fff8dc"
      ctx.lineWidth = Math.max(0.5, scale * 1.5)
      ctx.stroke()
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
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { scale, offsetX, offsetY } = viewRef.current
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.max(0.05, Math.min(3, scale * factor))
    // Zoom toward cursor position
    viewRef.current.scale = newScale
    viewRef.current.offsetX = mx - (mx - offsetX) * (newScale / scale)
    viewRef.current.offsetY = my - (my - offsetY) * (newScale / scale)
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
      const minR = NODE_MIN_RADIUS[node.type] ?? 2
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * scale, minR)
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
        style={{ background: "#0e0e17" }}
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

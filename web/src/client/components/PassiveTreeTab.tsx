import { useRef, useEffect, useLayoutEffect, useCallback, useState } from "react"
import type { BuildConfig } from "../types"
import { usePassiveTree } from "../hooks/usePassiveTree"
import type { TreeNode } from "../lib/tree-data"

// ─── Sprite types ────────────────────────────────────────────────────────────
interface SpriteCoord { url: string; x: number; y: number; w: number; h: number }
interface SpritesData {
  inactive: Record<string, SpriteCoord>
  active:   Record<string, SpriteCoord>
  frames:   Record<string, SpriteCoord>
}

// ─── Node sizing (world-coordinate radii) ────────────────────────────────────
const NODE_RADIUS: Record<string, number> = {
  keystone: 24, notable: 14, normal: 8, socket: 12, mastery: 12, ascendancy: 12,
}
const NODE_MIN_RADIUS: Record<string, number> = {
  keystone: 5, notable: 3.5, normal: 2, socket: 3, mastery: 2.5, ascendancy: 3,
}
const NODE_COLOR: Record<string, string> = {
  keystone: "#8b6914", notable: "#2a6099", normal: "#555",
  socket: "#6a3a8a", mastery: "#3a3a3a", ascendancy: "#7a6030",
}
const ALLOCATED_COLOR = "#ffd700"
const LINE_UNALLOC = "rgba(120,120,120,0.35)"
const LINE_ALLOC   = "rgba(255,200,50,0.75)"

// Frame sprite names per node type
const FRAME_NORMAL: Record<string, string>    = { normal: "PSSkillFrame",        notable: "NotableFrameUnallocated", keystone: "KeystoneFrameUnallocated" }
const FRAME_ALLOCATED: Record<string, string> = { normal: "PSSkillFrameActive",  notable: "NotableFrameAllocated",   keystone: "KeystoneFrameAllocated"   }

// Global sprite-sheet cache: URL → HTMLImageElement (null = loading/failed)
const sheetCache = new Map<string, HTMLImageElement | null>()

interface Props {
  buildConfig: BuildConfig
  onAllocChange?: (allocNodes: number[]) => void
}

export function PassiveTreeTab({ buildConfig, onAllocChange }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef      = useRef({ dragging: false, lastX: 0, lastY: 0 })
  const viewRef      = useRef({ scale: 0.25, offsetX: 0, offsetY: 0 })
  const initializedRef = useRef(false)
  const drawRef      = useRef<() => void>(() => {})
  const spritesRef   = useRef<SpritesData | null>(null)

  const [tooltip, setTooltip] = useState<{ node: TreeNode; x: number; y: number } | null>(null)
  const { nodes, allocated, toggleNode } = usePassiveTree(buildConfig.tree.allocNodes)

  // Fetch sprite coords once
  useEffect(() => {
    fetch("/api/sprites")
      .then(r => r.json())
      .then((d: SpritesData) => { spritesRef.current = d; drawRef.current() })
      .catch(() => {})
  }, [])

  // Load a sprite sheet by URL, trigger redraw when ready
  const loadSheet = useCallback((url: string): HTMLImageElement | null => {
    if (sheetCache.has(url)) return sheetCache.get(url)!
    sheetCache.set(url, null)
    const img = new Image()
    img.onload = () => { sheetCache.set(url, img); drawRef.current() }
    img.onerror = () => {}
    img.src = url
    return null
  }, [])

  // Dynamically size canvas to match CSS display size × DPR
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = canvas.clientWidth  * dpr
      canvas.height = canvas.clientHeight * dpr
      drawRef.current()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const draw = useCallback(() => {
    drawRef.current = draw
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext("2d")!
    const dpr  = window.devicePixelRatio || 1
    const logW = canvas.width  / dpr
    const logH = canvas.height / dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { scale } = viewRef.current

    // On first draw, zoom to fit allocated nodes (same as ⊙ button)
    if (!initializedRef.current && logW > 0 && logH > 0) {
      initializedRef.current = true
      const allocList = nodes.filter(n => !n.ascendancyName && allocated.has(n.id))
      const source = allocList.length > 0 ? allocList : nodes.filter(n => !n.ascendancyName)
      if (source.length > 0) {
        const minX = Math.min(...source.map(n => n.x))
        const maxX = Math.max(...source.map(n => n.x))
        const minY = Math.min(...source.map(n => n.y))
        const maxY = Math.max(...source.map(n => n.y))
        const rangeX = maxX - minX || 1
        const rangeY = maxY - minY || 1
        const pad = 80
        const newScale = Math.min((logW - pad * 2) / rangeX, (logH - pad * 2) / rangeY, 2)
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        viewRef.current.scale = newScale
        viewRef.current.offsetX = logW / 2 - cx * newScale
        viewRef.current.offsetY = logH / 2 - cy * newScale
      }
    }

    const { scale: sc, offsetX: ox, offsetY: oy } = viewRef.current

    ctx.clearRect(0, 0, logW, logH)
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, logW, logH)

    const nodeMap = new Map<number, { x: number; y: number; ascendancyName?: string }>()
    for (const n of nodes) nodeMap.set(n.id, { x: n.x, y: n.y, ascendancyName: n.ascendancyName })

    const mainNodes = nodes.filter(n => !n.ascendancyName)
    const treeCx = mainNodes.reduce((s, n) => s + n.x, 0) / mainNodes.length
    const treeCy = mainNodes.reduce((s, n) => s + n.y, 0) / mainNodes.length

    const pad = 80
    const inView = (wx: number, wy: number) => {
      const sx = wx * sc + ox, sy = wy * sc + oy
      return sx >= -pad && sx <= logW + pad && sy >= -pad && sy <= logH + pad
    }

    // Arc edge helper
    const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
      const d1 = Math.sqrt((x1 - treeCx) ** 2 + (y1 - treeCy) ** 2)
      const d2 = Math.sqrt((x2 - treeCx) ** 2 + (y2 - treeCy) ** 2)
      const avgD = (d1 + d2) / 2
      const sx1 = x1 * sc + ox, sy1 = y1 * sc + oy
      const sx2 = x2 * sc + ox, sy2 = y2 * sc + oy
      if (avgD > 400 && Math.abs(d1 - d2) / avgD < 0.10) {
        const a1 = Math.atan2(y1 - treeCy, x1 - treeCx)
        const a2 = Math.atan2(y2 - treeCy, x2 - treeCx)
        let da = a2 - a1
        if (da >  Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI
        if (Math.abs(da) < Math.PI / 3) {
          const mid = a1 + da / 2
          const cpx = (4 * (treeCx + avgD * Math.cos(mid)) - x1 - x2) / 2 * sc + ox
          const cpy = (4 * (treeCy + avgD * Math.sin(mid)) - y1 - y2) / 2 * sc + oy
          ctx.moveTo(sx1, sy1)
          ctx.quadraticCurveTo(cpx, cpy, sx2, sy2)
          return
        }
      }
      ctx.moveTo(sx1, sy1)
      ctx.lineTo(sx2, sy2)
    }

    // Pass 1: unallocated edges
    ctx.lineWidth = Math.max(0.5, sc * 1.5)
    ctx.strokeStyle = LINE_UNALLOC
    ctx.beginPath()
    for (const node of nodes) {
      if (node.ascendancyName || !node.out?.length) continue
      for (const toId of node.out) {
        const to = nodeMap.get(toId)
        if (!to || to.ascendancyName) continue
        if (allocated.has(node.id) && allocated.has(toId)) continue
        if (!inView(node.x, node.y) && !inView(to.x, to.y)) continue
        addEdge(node.x, node.y, to.x, to.y)
      }
    }
    ctx.stroke()

    // Pass 2: allocated edges
    ctx.lineWidth = Math.max(1, sc * 2.5)
    ctx.strokeStyle = LINE_ALLOC
    ctx.beginPath()
    for (const node of nodes) {
      if (node.ascendancyName || !allocated.has(node.id) || !node.out?.length) continue
      for (const toId of node.out) {
        if (!allocated.has(toId)) continue
        const to = nodeMap.get(toId)
        if (!to || to.ascendancyName) continue
        if (!inView(node.x, node.y) && !inView(to.x, to.y)) continue
        addEdge(node.x, node.y, to.x, to.y)
      }
    }
    ctx.stroke()

    const sprites = spritesRef.current

    // Draw a sprite (icon or frame) centered at (cx, cy) with target display size dw × dh
    const drawSprite = (coord: SpriteCoord, cx: number, cy: number, dw: number, dh: number) => {
      const sheet = loadSheet(coord.url)
      if (!sheet) return
      ctx.drawImage(sheet, coord.x, coord.y, coord.w, coord.h, cx - dw / 2, cy - dh / 2, dw, dh)
    }

    const visibleNodes = nodes.filter(n => !n.ascendancyName && inView(n.x, n.y))

    for (const pass of [false, true]) { // pass=false: unallocated, pass=true: allocated
      for (const node of visibleNodes) {
        const isAlloc = allocated.has(node.id)
        if (isAlloc !== pass) continue
        const sx = node.x * sc + ox
        const sy = node.y * sc + oy
        const minR = NODE_MIN_RADIUS[node.type] ?? 2
        const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR)

        // ── Sprite rendering (when sprites loaded and node is big enough) ──
        if (sprites && node.icon && r >= 4) {
          const iconCoord = isAlloc ? (sprites.active[node.icon] ?? sprites.inactive[node.icon]) : sprites.inactive[node.icon]
          if (iconCoord) {
            const iconDiam = r * 2
            drawSprite(iconCoord, sx, sy, iconDiam, iconDiam)

            // Frame
            const frameName = (isAlloc ? FRAME_ALLOCATED : FRAME_NORMAL)[node.type]
            const frameCoord = frameName ? sprites.frames[frameName] : undefined
            if (frameCoord) {
              const frameRatio = frameCoord.w / iconCoord.w
              drawSprite(frameCoord, sx, sy, iconDiam * frameRatio, iconDiam * (frameCoord.h / iconCoord.h))
            }
            continue
          }
        }

        // ── Fallback: solid color circle ──
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = isAlloc ? ALLOCATED_COLOR : (NODE_COLOR[node.type] ?? "#555")
        ctx.fill()
        if (isAlloc) {
          ctx.strokeStyle = "#ffd700"
          ctx.lineWidth   = Math.max(0.8, sc * 1.5)
          ctx.stroke()
        }
      }
    }
  }, [nodes, allocated, loadSheet])

  useEffect(() => { draw() }, [draw])

  function getLogicalSize() {
    const c = canvasRef.current
    if (!c) return { w: 0, h: 0 }
    const dpr = window.devicePixelRatio || 1
    return { w: c.width / dpr, h: c.height / dpr }
  }

  function zoomBy(factor: number, cx?: number, cy?: number) {
    const { w, h } = getLogicalSize()
    const { scale, offsetX, offsetY } = viewRef.current
    const newScale = Math.max(0.05, Math.min(4, scale * factor))
    const mx = cx ?? w / 2, my = cy ?? h / 2
    viewRef.current.scale   = newScale
    viewRef.current.offsetX = mx - (mx - offsetX) * (newScale / scale)
    viewRef.current.offsetY = my - (my - offsetY) * (newScale / scale)
    draw()
  }

  function focusAllocated() {
    if (!canvasRef.current || nodes.length === 0) return
    const { w, h } = getLogicalSize()
    const allocList = nodes.filter(n => !n.ascendancyName && allocated.has(n.id))
    const source = allocList.length > 0 ? allocList : nodes.filter(n => !n.ascendancyName)
    if (source.length === 0) return
    const minX = Math.min(...source.map(n => n.x))
    const maxX = Math.max(...source.map(n => n.x))
    const minY = Math.min(...source.map(n => n.y))
    const maxY = Math.max(...source.map(n => n.y))
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
    const pad = 60
    const newScale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY, 2)
    viewRef.current.scale   = newScale
    viewRef.current.offsetX = w / 2 - (minX + maxX) / 2 * newScale
    viewRef.current.offsetY = h / 2 - (minY + maxY) / 2 * newScale
    draw()
  }

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
    setTooltip(null)
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current.dragging) {
      viewRef.current.offsetX += e.clientX - dragRef.current.lastX
      viewRef.current.offsetY += e.clientY - dragRef.current.lastY
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      draw(); setTooltip(null)
      return
    }
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { scale: sc, offsetX, offsetY } = viewRef.current
    let found: TreeNode | null = null
    for (const node of nodes) {
      if (node.ascendancyName) continue
      const sx = node.x * sc + offsetX, sy = node.y * sc + offsetY
      const minR = NODE_MIN_RADIUS[node.type] ?? 2
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR)
      if (Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) <= Math.max(r + 2, 8)) { found = node; break }
    }
    if (found) {
      const cRect = containerRef.current?.getBoundingClientRect()
      setTooltip({ node: found, x: cRect ? e.clientX - cRect.left : e.clientX, y: cRect ? e.clientY - cRect.top : e.clientY })
    } else {
      setTooltip(null)
    }
  }
  function onMouseUp()   { dragRef.current.dragging = false }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    zoomBy(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top)
  }
  function onClick(e: React.MouseEvent) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { scale: sc, offsetX, offsetY } = viewRef.current
    for (const node of nodes) {
      if (node.ascendancyName) continue
      const sx = node.x * sc + offsetX, sy = node.y * sc + offsetY
      const minR = NODE_MIN_RADIUS[node.type] ?? 2
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR)
      if (Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) <= Math.max(r, 6)) {
        toggleNode(node.id)
        const next = new Set(allocated)
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id)
        onAllocChange?.(Array.from(next))
        return
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: "calc(100vh - 120px)" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ background: "#000000" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onClick}
      />
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        {[
          { label: "+", title: "放大", action: () => zoomBy(1.25) },
          { label: "−", title: "缩小", action: () => zoomBy(0.8) },
          { label: "⊙", title: "聚焦已分配节点", action: focusAllocated },
        ].map(({ label, title, action }) => (
          <button key={label} onClick={action} title={title}
            className="w-9 h-9 flex items-center justify-center rounded border border-white/40 bg-black/70 text-white hover:bg-black/90 hover:border-white/70 text-base font-bold leading-none select-none shadow"
          >{label}</button>
        ))}
      </div>
      {/* Tooltip */}
      {tooltip && (
        <div className="pointer-events-none absolute z-50 max-w-[220px] rounded border border-white/20 bg-black/90 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          <div className="font-semibold text-yellow-300 mb-1">{tooltip.node.name || "(无名)"}</div>
          <div className="text-white/50 text-[10px] mb-1 capitalize">{tooltip.node.type}</div>
          {tooltip.node.mods.length > 0
            ? <ul className="space-y-0.5">{tooltip.node.mods.map((m, i) => <li key={i} className="text-white/80">{m}</li>)}</ul>
            : <div className="text-white/40 italic">无属性</div>
          }
        </div>
      )}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">
        已分配 {allocated.size} 节点 · 拖拽平移 · 滚轮缩放
      </div>
    </div>
  )
}

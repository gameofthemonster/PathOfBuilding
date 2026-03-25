import {
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useState,
} from "react";
import type { BuildConfig } from "../types";
import { usePassiveTree } from "../hooks/usePassiveTree";
import { fetchTreeMeta } from "../lib/tree-data";
import type {
  TreeNode,
  TreeMeta,
  TreeMetaGroup,
  SpriteCoord,
} from "../lib/tree-data";
import { useI18n } from "../hooks/useI18n";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJewelMods(rawText: string): string[] {
  const lines = rawText.split("\n").map((l) => l.trim());
  let implicitCount = 0;
  let pastHeader = false;
  const mods: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith("<")) continue;
    const m = line.match(/^Implicits:\s*(\d+)$/);
    if (m) {
      implicitCount = parseInt(m[1]);
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    mods.push(
      line
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"'),
    );
  }
  return mods.slice(implicitCount); // only explicits for jewels
}

// ─── Sprite types ────────────────────────────────────────────────────────────
interface SpritesData {
  normalInactive: Record<string, SpriteCoord>;
  notableInactive: Record<string, SpriteCoord>;
  keystoneInactive: Record<string, SpriteCoord>;
  normalActive: Record<string, SpriteCoord>;
  notableActive: Record<string, SpriteCoord>;
  keystoneActive: Record<string, SpriteCoord>;
  frames: Record<string, SpriteCoord>;
  groupBg: Record<string, SpriteCoord>;
  ascendancy: Record<string, SpriteCoord>;
  background: Record<string, SpriteCoord>;
  jewel: Record<string, SpriteCoord>;
  jewelRadius: Record<string, SpriteCoord>;
}

// ─── Orbit angle calculation (mirrors PassiveTree.lua:CalcOrbitAngles) ───────
function calcOrbitAngles(nodesInOrbit: number): number[] {
  let degrees: number[];
  if (nodesInOrbit === 16) {
    degrees = [
      0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330,
    ];
  } else if (nodesInOrbit === 40) {
    degrees = [
      0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140,
      150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280,
      290, 300, 310, 315, 320, 330, 340, 350,
    ];
  } else {
    degrees = Array.from(
      { length: nodesInOrbit },
      (_, i) => (360 * i) / nodesInOrbit,
    );
  }
  return degrees.map((d) => (d * Math.PI) / 180);
}

// ─── Node sizing (world-coordinate radii) ────────────────────────────────────
// API returns Title Case types: Normal, Notable, Keystone, Socket, Mastery, ClassStart, AscendClassStart
const NODE_RADIUS: Record<string, number> = {
  Keystone: 24,
  Notable: 14,
  Normal: 8,
  Socket: 12,
  Mastery: 12,
  ClassStart: 16,
  AscendClassStart: 16,
};
const NODE_MIN_RADIUS: Record<string, number> = {
  Keystone: 5,
  Notable: 3.5,
  Normal: 2,
  Socket: 3,
  Mastery: 2.5,
  ClassStart: 3,
  AscendClassStart: 3,
};
const NODE_COLOR: Record<string, string> = {
  Keystone: "#8b6914",
  Notable: "#2a6099",
  Normal: "#555",
  Socket: "#6a3a8a",
  Mastery: "#3a3a3a",
  ClassStart: "#7a6030",
  AscendClassStart: "#7a6030",
};
const ALLOCATED_COLOR = "#ffd700";
const LINE_UNALLOC = "rgba(120,120,120,0.35)";
const LINE_ALLOC = "rgba(255,200,50,0.75)";

// Frame sprite names per node type (Title Case keys matching API)
const FRAME_NORMAL: Record<string, string> = {
  Normal: "PSSkillFrame",
  Notable: "NotableFrameUnallocated",
  Keystone: "KeystoneFrameUnallocated",
  Socket: "JewelFrameUnallocated",
};
const FRAME_ALLOCATED: Record<string, string> = {
  Normal: "PSSkillFrameActive",
  Notable: "NotableFrameAllocated",
  Keystone: "KeystoneFrameAllocated",
  Socket: "JewelFrameAllocated",
};

// Group background sprite name by bg level
const GROUP_BG_SPRITE: Record<number, string> = {
  1: "PSGroupBackground1",
  2: "PSGroupBackground2",
  3: "PSGroupBackground3",
};

// Global sprite-sheet cache: URL → HTMLImageElement (null = loading/failed)
const sheetCache = new Map<string, HTMLImageElement | null>();

interface Props {
  buildConfig: BuildConfig;
  onAllocChange?: (allocNodes: number[]) => void;
}

export function PassiveTreeTab({ buildConfig, onAllocChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const viewRef = useRef({ scale: 0.25, offsetX: 0, offsetY: 0 });
  const initializedRef = useRef(false);
  const drawRef = useRef<() => void>(() => {});
  const spritesRef = useRef<SpritesData | null>(null);
  const buildConfigRef = useRef(buildConfig);
  buildConfigRef.current = buildConfig;

  const treeMetaRef = useRef<TreeMeta | null>(null);

  const [tooltip, setTooltip] = useState<{
    node: TreeNode;
    x: number;
    y: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { nodes, allocated, toggleNode } = usePassiveTree(
    buildConfig.tree.allocNodes,
  );
  const { t } = useI18n();

  // Fetch sprite coords once
  useEffect(() => {
    fetch("/api/sprites")
      .then((r) => r.json())
      .then((d: SpritesData) => {
        spritesRef.current = d;
        drawRef.current();
      })
      .catch(() => {});
  }, []);

  // Fetch tree meta (groups, orbit data) once
  useEffect(() => {
    fetchTreeMeta().then((meta) => {
      treeMetaRef.current = meta;
      drawRef.current();
    });
  }, []);

  // Load a sprite sheet by URL, trigger redraw when ready
  const loadSheet = useCallback((url: string): HTMLImageElement | null => {
    if (sheetCache.has(url)) return sheetCache.get(url)!;
    sheetCache.set(url, null);
    const img = new Image();
    img.onload = () => {
      sheetCache.set(url, img);
      drawRef.current();
    };
    img.onerror = () => {};
    img.src = url;
    return null;
  }, []);

  // Dynamically size canvas to match CSS display size × DPR
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      drawRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    drawRef.current = draw;
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const logW = canvas.width / dpr;
    const logH = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { scale } = viewRef.current;

    // On first draw, zoom to fit allocated nodes (same as ⊙ button)
    if (!initializedRef.current && logW > 0 && logH > 0) {
      initializedRef.current = true;
      const allocList = nodes.filter(
        (n) => !n.ascendancyName && allocated.has(n.id),
      );
      const source =
        allocList.length > 0
          ? allocList
          : nodes.filter((n) => !n.ascendancyName);
      if (source.length > 0) {
        const minX = Math.min(...source.map((n) => n.x));
        const maxX = Math.max(...source.map((n) => n.x));
        const minY = Math.min(...source.map((n) => n.y));
        const maxY = Math.max(...source.map((n) => n.y));
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;
        const pad = 80;
        const newScale = Math.min(
          (logW - pad * 2) / rangeX,
          (logH - pad * 2) / rangeY,
          2,
        );
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        viewRef.current.scale = newScale;
        viewRef.current.offsetX = logW / 2 - cx * newScale;
        viewRef.current.offsetY = logH / 2 - cy * newScale;
      }
    }

    const { scale: sc, offsetX: ox, offsetY: oy } = viewRef.current;

    ctx.clearRect(0, 0, logW, logH);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, logW, logH);

    const nodeMap = new Map<
      number,
      { x: number; y: number; ascendancyName?: string }
    >();
    for (const n of nodes)
      nodeMap.set(n.id, { x: n.x, y: n.y, ascendancyName: n.ascendancyName });

    const pad = 80;
    const inView = (wx: number, wy: number) => {
      const sx = wx * sc + ox,
        sy = wy * sc + oy;
      return sx >= -pad && sx <= logW + pad && sy >= -pad && sy <= logH + pad;
    };

    const meta = treeMetaRef.current;
    const sprites = spritesRef.current;

    // Pre-compute orbit angle tables from tree-meta
    const orbitAnglesByOrbit: number[][] = [];
    if (meta) {
      for (let i = 0; i < meta.skillsPerOrbit.length; i++) {
        orbitAnglesByOrbit[i] = calcOrbitAngles(meta.skillsPerOrbit[i]);
      }
    }

    // Draw a sprite sheet region centered at (cx, cy) with POB DrawAsset sizing
    // size = coord.w * sc * 1.33 * 2  (centered, aspect preserved)
    const drawAsset = (
      coord: SpriteCoord,
      cx: number,
      cy: number,
      isHalf = false,
    ) => {
      const sheet = loadSheet(coord.url);
      if (!sheet) return;
      const w2 = coord.w * sc * 1.33; // half-width
      const h2 = coord.h * sc * 1.33; // half-height
      if (isHalf) {
        // Top half: normal
        ctx.drawImage(
          sheet,
          coord.x,
          coord.y,
          coord.w,
          coord.h,
          cx - w2,
          cy - h2 * 2,
          w2 * 2,
          h2 * 2,
        );
        // Bottom half: vertically flipped
        ctx.save();
        ctx.translate(cx - w2, cy + h2 * 2);
        ctx.scale(1, -1);
        ctx.drawImage(
          sheet,
          coord.x,
          coord.y,
          coord.w,
          coord.h,
          0,
          0,
          w2 * 2,
          h2 * 2,
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          sheet,
          coord.x,
          coord.y,
          coord.w,
          coord.h,
          cx - w2,
          cy - h2,
          w2 * 2,
          h2 * 2,
        );
      }
    };

    // Draw a sprite centered at (cx, cy) with explicit display size dw × dh
    const drawSprite = (
      coord: SpriteCoord,
      cx: number,
      cy: number,
      dw: number,
      dh: number,
    ) => {
      const sheet = loadSheet(coord.url);
      if (!sheet) return;
      ctx.drawImage(
        sheet,
        coord.x,
        coord.y,
        coord.w,
        coord.h,
        cx - dw / 2,
        cy - dh / 2,
        dw,
        dh,
      );
    };

    // ── Layer 1: Background tile ───────────────────────────────────────────────
    const bgCoord = sprites?.background?.Background2;
    if (bgCoord) {
      const bgSheet = loadSheet(bgCoord.url);
      if (bgSheet) {
        // POB: bgSize = bg.width * scale * 1.33 * 2.5
        const tileSize = bgCoord.w * sc * 1.33 * 2.5;
        const startX = (((ox % tileSize) + tileSize) % tileSize) - tileSize;
        const startY = (((oy % tileSize) + tileSize) % tileSize) - tileSize;
        for (let tx = startX; tx < logW + tileSize; tx += tileSize) {
          for (let ty = startY; ty < logH + tileSize; ty += tileSize) {
            ctx.drawImage(
              bgSheet,
              bgCoord.x,
              bgCoord.y,
              bgCoord.w,
              bgCoord.h,
              tx,
              ty,
              tileSize,
              tileSize,
            );
          }
        }
      }
    }

    // ── Layer 2: Group backgrounds & ascendancy circles ───────────────────────
    if (meta && sprites) {
      for (const [, group] of Object.entries(meta.groups)) {
        const g = group as TreeMetaGroup;
        const scrX = g.x * sc + ox;
        const scrY = g.y * sc + oy;
        // Broad cull: skip groups far off screen
        if (
          scrX < -800 ||
          scrX > logW + 800 ||
          scrY < -800 ||
          scrY > logH + 800
        )
          continue;

        if (g.ascendancyName && g.isAscendancyStart) {
          // Ascendancy start group: draw the ascendancy circle
          const coord = sprites.ascendancy["Classes" + g.ascendancyName];
          if (coord) drawAsset(coord, scrX, scrY);
        } else if (!g.ascendancyName && g.bg > 0) {
          // Normal group background
          const spriteName = GROUP_BG_SPRITE[g.bg];
          const coord = spriteName ? sprites.groupBg[spriteName] : undefined;
          if (coord) drawAsset(coord, scrX, scrY, g.bg === 3);
        }
      }
    }

    // Edge helper: arc for same-group/same-orbit, straight line otherwise
    const addEdge = (
      id1: number,
      x1: number,
      y1: number,
      id2: number,
      x2: number,
      y2: number,
    ) => {
      const sx1 = x1 * sc + ox,
        sy1 = y1 * sc + oy;
      const sx2 = x2 * sc + ox,
        sy2 = y2 * sc + oy;

      if (meta) {
        const n1 = meta.nodes[String(id1)];
        const n2 = meta.nodes[String(id2)];
        if (n1 && n2 && n1.g === n2.g && n1.o === n2.o) {
          const group = meta.groups[String(n1.g)];
          const orbitR = meta.orbitRadii[n1.o] ?? 0;
          const angles = orbitAnglesByOrbit[n1.o];
          if (group && orbitR > 0 && angles) {
            let a1 =
              angles[n1.oidx] ?? Math.atan2(x1 - group.x, -(y1 - group.y));
            let a2 =
              angles[n2.oidx] ?? Math.atan2(x2 - group.x, -(y2 - group.y));
            // POB: x = gx + sin(a)*r, y = gy - cos(a)*r → canvas θ = a - π/2
            a1 = a1 - Math.PI / 2;
            a2 = a2 - Math.PI / 2;
            let da = a2 - a1;
            if (da > Math.PI) da -= 2 * Math.PI;
            if (da < -Math.PI) da += 2 * Math.PI;
            if (Math.abs(da) < Math.PI * 1.01) {
              const gcx = group.x * sc + ox;
              const gcy = group.y * sc + oy;
              const arcR = orbitR * sc;
              ctx.moveTo(gcx + arcR * Math.cos(a1), gcy + arcR * Math.sin(a1));
              ctx.arc(gcx, gcy, arcR, a1, a2, da < 0);
              return;
            }
          }
        }
      }

      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
    };

    const lineWidth = Math.min(Math.max(1, sc * 20), 8);

    // ── Layer 3: Edges ────────────────────────────────────────────────────────
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = LINE_UNALLOC;
    ctx.beginPath();
    for (const node of nodes) {
      if (!node.out?.length) continue;
      for (const toId of node.out) {
        const to = nodeMap.get(toId);
        if (!to) continue;
        if (node.ascendancyName !== to.ascendancyName) continue; // skip cross-context edges
        if (allocated.has(node.id) && allocated.has(toId)) continue;
        if (!inView(node.x, node.y) && !inView(to.x, to.y)) continue;
        addEdge(node.id, node.x, node.y, toId, to.x, to.y);
      }
    }
    ctx.stroke();

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = LINE_ALLOC;
    ctx.beginPath();
    for (const node of nodes) {
      if (!allocated.has(node.id) || !node.out?.length) continue;
      for (const toId of node.out) {
        if (!allocated.has(toId)) continue;
        const to = nodeMap.get(toId);
        if (!to) continue;
        if (node.ascendancyName !== to.ascendancyName) continue; // skip cross-context edges
        if (!inView(node.x, node.y) && !inView(to.x, to.y)) continue;
        addEdge(node.id, node.x, node.y, toId, to.x, to.y);
      }
    }
    ctx.stroke();

    // ── Layers 4-5: Nodes (icons + frames) ───────────────────────────────────
    const visibleNodes = nodes.filter((n) => inView(n.x, n.y));

    // Build search hit set
    const query = searchQuery.trim().toLowerCase();
    const searchHits = new Set<number>();
    if (query) {
      for (const n of nodes) {
        const enName = (n.name ?? "").toLowerCase();
        const cnName = t(n.name ?? "").toLowerCase();
        if (enName.includes(query) || cnName.includes(query))
          searchHits.add(n.id);
      }
    }

    // Get frame sprite name: ascendancy nodes use their own frame set
    const getFrameName = (
      node: TreeNode,
      isAlloc: boolean,
    ): string | undefined => {
      if (node.ascendancyName) {
        if (node.type === "Notable")
          return isAlloc
            ? "AscendancyFrameLargeAllocated"
            : "AscendancyFrameLargeNormal";
        return isAlloc
          ? "AscendancyFrameSmallAllocated"
          : "AscendancyFrameSmallNormal";
      }
      return (isAlloc ? FRAME_ALLOCATED : FRAME_NORMAL)[node.type];
    };

    // Pass 1: Icons only (unallocated then allocated) ─ frames will go on top in pass 2
    for (const pass of [false, true]) {
      for (const node of visibleNodes) {
        const isAlloc = allocated.has(node.id);
        if (isAlloc !== pass) continue;
        const sx = node.x * sc + ox;
        const sy = node.y * sc + oy;
        const minR = NODE_MIN_RADIUS[node.type] ?? 2;
        const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR);

        if (sprites) {
          // Jewel socket: use dedicated socket sprite based on size
          if (node.type === "Socket") {
            const nm = node.name ?? "";
            let spriteName: string;
            if (nm.includes("Large"))
              spriteName = isAlloc
                ? "JewelSocketClusterAltCanAllocate1Large"
                : "JewelSocketClusterAltNormal1Large";
            else if (nm.includes("Medium"))
              spriteName = isAlloc
                ? "JewelSocketClusterAltCanAllocate1Medium"
                : "JewelSocketClusterAltNormal1Medium";
            else if (nm.includes("Small"))
              spriteName = isAlloc
                ? "JewelSocketClusterAltCanAllocate1Small"
                : "JewelSocketClusterAltNormal1Small";
            else
              spriteName = isAlloc
                ? "JewelSocketAltActive"
                : "JewelSocketAltNormal";
            const socketCoord = sprites.frames[spriteName];
            if (socketCoord) {
              const dw = socketCoord.w * sc * 1.33 * 2;
              const dh = socketCoord.h * sc * 1.33 * 2;
              drawSprite(socketCoord, sx, sy, dw, dh);
              continue;
            }
          }

          const iconName = node.icon;
          const isKeystone = node.type === "Keystone";
          const isNotable = node.type === "Notable";
          const inactiveDict = isKeystone
            ? sprites.keystoneInactive
            : isNotable
              ? sprites.notableInactive
              : sprites.normalInactive;
          const activeDict = isKeystone
            ? sprites.keystoneActive
            : isNotable
              ? sprites.notableActive
              : sprites.normalActive;
          const iconCoord =
            iconName && inactiveDict
              ? isAlloc
                ? (activeDict?.[iconName] ?? inactiveDict[iconName])
                : inactiveDict[iconName]
              : undefined;

          if (iconCoord) {
            const iconDw = Math.max(iconCoord.w * sc * 1.33 * 2, 3);
            const iconDh = Math.max(iconCoord.h * sc * 1.33 * 2, 3);
            drawSprite(iconCoord, sx, sy, iconDw, iconDh);
            continue;
          }
        }

        // Fallback: solid circle
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isAlloc
          ? ALLOCATED_COLOR
          : (NODE_COLOR[node.type] ?? "#555");
        ctx.fill();
        if (isAlloc) {
          ctx.strokeStyle = "#ffd700";
          ctx.lineWidth = Math.min(Math.max(0.8, sc * 3), 5);
          ctx.stroke();
        }
      }
    }

    // Pass 2: Frames on top of all icons (unallocated then allocated)
    if (sprites) {
      for (const pass of [false, true]) {
        for (const node of visibleNodes) {
          const isAlloc = allocated.has(node.id);
          if (isAlloc !== pass) continue;
          const sx = node.x * sc + ox;
          const sy = node.y * sc + oy;
          const minR = NODE_MIN_RADIUS[node.type] ?? 2;
          const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR);
          if (r < 1) continue;

          // Socket nodes handle their own frame in Pass 1; only draw a JewelFrame for Basic sockets
          const isSocketNode = node.type === "Socket";
          const nm = isSocketNode ? (node.name ?? "") : "";
          const isClusterSocket = nm.includes("Large") || nm.includes("Medium") || nm.includes("Small");
          if (!isSocketNode || !isClusterSocket) {
            const frameName = getFrameName(node, isAlloc);
            const frameCoord = frameName
              ? (sprites.frames[frameName] ?? sprites.ascendancy[frameName])
              : undefined;
            if (frameCoord) {
              const frameDw = Math.max(frameCoord.w * sc * 1.33 * 2, 3);
              const frameDh = Math.max(frameCoord.h * sc * 1.33 * 2, 3);
              drawSprite(frameCoord, sx, sy, frameDw, frameDh);
            }
          }
          // Gem icon on top for socket nodes with an equipped jewel
          if (isSocketNode && sprites.jewel) {
            const hasJewel = !!buildConfigRef.current.tree.jewels?.[node.id];
            if (hasJewel) {
              const gemCoord = sprites.jewel[isClusterSocket ? "JewelSocketActivePrismaticAlt" : "JewelSocketActivePrismatic"];
              if (gemCoord) {
                drawSprite(gemCoord, sx, sy, gemCoord.w * sc * 1.33 * 2, gemCoord.h * sc * 1.33 * 2);
              }
            }
          }
        }
      }
    }

    // ── Layer 6b: Jewel radius circles (on top of nodes) ──────────────────────
    if (sprites?.jewelRadius) {
      const bc = buildConfigRef.current;
      const radiusCoord = sprites.jewelRadius["JewelCircle1"];
      if (radiusCoord) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = "screen";
        for (const node of visibleNodes) {
          if (node.type !== "Socket" || node.ascendancyName) continue;
          const hasJewel = !!bc.tree.jewels?.[node.id];
          if (!hasJewel) continue;
          const sx = node.x * sc + ox;
          const sy = node.y * sc + oy;
          const radiusPx = 1200 * sc;
          drawSprite(radiusCoord, sx, sy, radiusPx * 2, radiusPx * 2);
        }
        ctx.restore();
      }
    }

    // ── Layer 7: Search highlights ────────────────────────────────────────────
    if (searchHits.size > 0) {
      // Dim non-matching nodes
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, logW, logH);
      // Glow ring on matching nodes
      for (const node of visibleNodes) {
        if (!searchHits.has(node.id)) continue;
        const sx = node.x * sc + ox;
        const sy = node.y * sc + oy;
        const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc * 1.4, 6);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffe066";
        ctx.lineWidth = Math.min(Math.max(1.5, sc * 4), 6);
        ctx.stroke();
      }
    }
  }, [nodes, allocated, loadSheet, searchQuery, t]);

  useEffect(() => {
    draw();
  }, [draw]);

  function getLogicalSize() {
    const c = canvasRef.current;
    if (!c) return { w: 0, h: 0 };
    const dpr = window.devicePixelRatio || 1;
    return { w: c.width / dpr, h: c.height / dpr };
  }

  function zoomBy(factor: number, cx?: number, cy?: number) {
    const { w, h } = getLogicalSize();
    const { scale, offsetX, offsetY } = viewRef.current;
    const newScale = Math.max(0.05, Math.min(1.5, scale * factor));
    const mx = cx ?? w / 2,
      my = cy ?? h / 2;
    viewRef.current.scale = newScale;
    viewRef.current.offsetX = mx - (mx - offsetX) * (newScale / scale);
    viewRef.current.offsetY = my - (my - offsetY) * (newScale / scale);
    draw();
  }

  function focusAllocated() {
    if (!canvasRef.current || nodes.length === 0) return;
    const { w, h } = getLogicalSize();
    const allocList = nodes.filter(
      (n) => !n.ascendancyName && allocated.has(n.id),
    );
    const source =
      allocList.length > 0 ? allocList : nodes.filter((n) => !n.ascendancyName);
    if (source.length === 0) return;
    const minX = Math.min(...source.map((n) => n.x));
    const maxX = Math.max(...source.map((n) => n.x));
    const minY = Math.min(...source.map((n) => n.y));
    const maxY = Math.max(...source.map((n) => n.y));
    const rangeX = maxX - minX || 1,
      rangeY = maxY - minY || 1;
    const pad = 60;
    const newScale = Math.min(
      (w - pad * 2) / rangeX,
      (h - pad * 2) / rangeY,
      1.5,
    );
    viewRef.current.scale = newScale;
    viewRef.current.offsetX = w / 2 - ((minX + maxX) / 2) * newScale;
    viewRef.current.offsetY = h / 2 - ((minY + maxY) / 2) * newScale;
    draw();
  }

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
    setTooltip(null);
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current.dragging) {
      viewRef.current.offsetX += e.clientX - dragRef.current.lastX;
      viewRef.current.offsetY += e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      draw();
      setTooltip(null);
      return;
    }
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    const { scale: sc, offsetX, offsetY } = viewRef.current;
    let found: TreeNode | null = null;
    for (const node of nodes) {
      const sx = node.x * sc + offsetX,
        sy = node.y * sc + offsetY;
      const minR = NODE_MIN_RADIUS[node.type] ?? 2;
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR);
      if (
        Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) <= Math.max(r * 1.5 + 4, 12)
      ) {
        found = node;
        break;
      }
    }
    if (found) {
      const cRect = containerRef.current?.getBoundingClientRect();
      setTooltip({
        node: found,
        x: cRect ? e.clientX - cRect.left : e.clientX,
        y: cRect ? e.clientY - cRect.top : e.clientY,
      });
    } else {
      setTooltip(null);
    }
  }
  function onMouseUp() {
    dragRef.current.dragging = false;
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    zoomBy(
      e.deltaY < 0 ? 1.1 : 0.9,
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
  }
  function onClick(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    const { scale: sc, offsetX, offsetY } = viewRef.current;
    for (const node of nodes) {
      const sx = node.x * sc + offsetX,
        sy = node.y * sc + offsetY;
      const minR = NODE_MIN_RADIUS[node.type] ?? 2;
      const r = Math.max((NODE_RADIUS[node.type] ?? 8) * sc, minR);
      if (
        Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) <= Math.max(r * 1.5 + 4, 12)
      ) {
        toggleNode(node.id);
        const next = new Set(allocated);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        onAllocChange?.(Array.from(next));
        return;
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: "calc(100vh - 120px)" }}
    >
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
      {/* Search box */}
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索天赋…"
          className="h-9 px-3 rounded border border-white/40 bg-black/70 text-white placeholder-white/40 text-sm outline-none focus:border-yellow-400/70 w-44"
          onMouseDown={(e) => e.stopPropagation()}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="h-9 w-9 flex items-center justify-center rounded border border-white/40 bg-black/70 text-white/60 hover:text-white hover:border-white/70 text-sm cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        {[
          { label: "+", title: "放大", action: () => zoomBy(1.25) },
          { label: "−", title: "缩小", action: () => zoomBy(0.8) },
          { label: "⊙", title: "聚焦已分配节点", action: focusAllocated },
        ].map(({ label, title, action }) => (
          <button
            key={label}
            onClick={action}
            title={title}
            className="w-9 h-9 flex items-center justify-center rounded border border-white/40 bg-black/70 text-white hover:bg-black/90 hover:border-white/70 text-lg cursor-pointer leading-none select-none shadow"
          >
            {label}
          </button>
        ))}
      </div>
      {/* Tooltip */}
      {tooltip &&
        (() => {
          const node = tooltip.node;
          const isSocket = node.type === "Socket";
          const jewelItemId = isSocket
            ? buildConfig.tree.jewels?.[node.id]
            : undefined;
          const jewelItem = jewelItemId
            ? buildConfig.items.itemList.find((it) => it.id === jewelItemId)
            : undefined;
          const jewelMods = jewelItem ? parseJewelMods(jewelItem.rawText) : [];
          return (
            <div
              className="pointer-events-none absolute z-50 max-w-[320px] rounded border border-white/20 bg-black/90 px-3 py-2 text-xs text-white shadow-lg"
              style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="font-semibold text-yellow-300 mb-1">
                  {t(node.name) || "(None)"}
                </div>
                <div className="text-white/50 text-[10px] mb-1 capitalize">
                  {t(node.type)}
                </div>
              </div>
              {node.mods.length > 0 && (
                <ul className="space-y-0.5 mb-1">
                  {node.mods.map((m, i) => (
                    <li key={i} className="text-white/80">
                      {t(m)}
                    </li>
                  ))}
                </ul>
              )}
              {isSocket &&
                (jewelItem ? (
                  <div className="mt-1 border-t border-white/10 pt-1">
                    <div className="font-medium text-orange-300/90 mb-0.5">
                      {t(jewelItem.name || jewelItem.base)}
                    </div>
                    {jewelMods.length > 0 ? (
                      <ul className="space-y-0.5">
                        {jewelMods.map((m, i) => (
                          <li key={i} className="text-sky-300/80">
                            {t(m)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-white/40 italic text-[10px]">
                        无词缀
                      </div>
                    )}
                  </div>
                ) : (
                  !node.mods.length && (
                    <div className="text-white/40 italic">空插槽</div>
                  )
                ))}
              {!isSocket && node.mods.length === 0 && (
                <div className="text-white/40 italic">无属性</div>
              )}
            </div>
          );
        })()}
      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-black/50 px-2 py-1 rounded">
        已分配 {allocated.size} 节点 · 拖拽平移 · 滚轮缩放
      </div>
    </div>
  );
}

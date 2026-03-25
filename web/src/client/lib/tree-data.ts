export interface TreeNode {
  id: number
  name: string
  type: "Normal" | "Keystone" | "Notable" | "Socket" | "Mastery" | "ClassStart" | "AscendClassStart"
  x: number
  y: number
  mods: string[]
  ascendancyName?: string
  out: number[]
  icon?: string
}

export interface SpriteCoord {
  url: string
  x: number
  y: number
  w: number
  h: number
}

export interface TreeMetaGroup {
  x: number
  y: number
  bg: number                  // 0=none, 1=small, 2=medium, 3=large
  ascendancyName?: string
  isAscendancyStart?: boolean
}

export interface TreeMeta {
  groups: Record<string, TreeMetaGroup>
  orbitRadii: number[]
  skillsPerOrbit: number[]
  nodes: Record<string, { g: number; o: number; oidx: number }>
  lineSprites: Record<string, SpriteCoord>
}

let cachedNodes: TreeNode[] | null = null
let cachedMeta: TreeMeta | null = null

export async function fetchTreeData(): Promise<TreeNode[]> {
  if (cachedNodes) return cachedNodes
  const res = await fetch("/api/tree-data")
  cachedNodes = await res.json()
  return cachedNodes!
}

export async function fetchTreeMeta(): Promise<TreeMeta | null> {
  if (cachedMeta) return cachedMeta
  try {
    const res = await fetch("/api/tree-meta")
    const data = await res.json() as TreeMeta
    if (data && data.groups) {
      cachedMeta = data
      return data
    }
  } catch {}
  return null
}

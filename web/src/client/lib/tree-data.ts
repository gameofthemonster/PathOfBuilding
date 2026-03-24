export interface TreeNode {
  id: number
  name: string
  type: "normal" | "keystone" | "notable" | "socket" | "mastery" | "ascendancy"
  x: number
  y: number
  mods: string[]
  ascendancyName?: string
}

let cachedNodes: TreeNode[] | null = null

export async function fetchTreeData(): Promise<TreeNode[]> {
  if (cachedNodes) return cachedNodes
  const res = await fetch("/api/tree-data")
  cachedNodes = await res.json()
  return cachedNodes!
}

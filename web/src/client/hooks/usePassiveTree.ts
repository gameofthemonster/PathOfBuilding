import { useEffect, useState, useMemo } from "react"
import { fetchTreeData, type TreeNode } from "../lib/tree-data"
import type { ClusterNode } from "../types"

export function usePassiveTree(allocNodes: number[], clusterNodes?: ClusterNode[]) {
  const [staticNodes, setStaticNodes] = useState<TreeNode[]>([])
  const [allocated, setAllocated] = useState<Set<number>>(new Set(allocNodes))

  useEffect(() => {
    fetchTreeData().then(setStaticNodes)
  }, [])

  useEffect(() => {
    setAllocated(new Set(allocNodes))
  }, [allocNodes])

  // Merge static nodes with cluster subgraph nodes; cluster nodes override by id if same id exists
  const nodes = useMemo<TreeNode[]>(() => {
    console.log("[usePassiveTree] clusterNodes count:", clusterNodes?.length)
    clusterNodes?.forEach((cn, i) => console.log(`  [${i}] id=${cn.id} type=${cn.type} x=${cn.x} y=${cn.y} name=${cn.name}`))
    if (!clusterNodes?.length) return staticNodes
    const extra = clusterNodes.map((cn) => ({
      id: cn.id,
      name: cn.name,
      type: cn.type as TreeNode["type"],
      x: cn.x,
      y: cn.y,
      mods: cn.mods,
      out: cn.out,
      icon: cn.icon,
      ascendancyName: undefined,
    }))
    // cluster nodes override static nodes by id (inner socket nodes get relocated positions)
    const clusterIdSet = new Set(extra.map((n) => n.id))
    const filtered = staticNodes.filter((n) => !clusterIdSet.has(n.id))
    return [...filtered, ...extra]
  }, [staticNodes, clusterNodes])

  function toggleNode(nodeId: number) {
    setAllocated((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  return { nodes, allocated, toggleNode }
}

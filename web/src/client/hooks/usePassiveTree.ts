import { useEffect, useState } from "react"
import { fetchTreeData, type TreeNode } from "../lib/tree-data"

export function usePassiveTree(allocNodes: number[]) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [allocated, setAllocated] = useState<Set<number>>(new Set(allocNodes))

  useEffect(() => {
    fetchTreeData().then(setNodes)
  }, [])

  useEffect(() => {
    setAllocated(new Set(allocNodes))
  }, [allocNodes])

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

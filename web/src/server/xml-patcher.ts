import { XMLParser, XMLBuilder } from "fast-xml-parser"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["Skill", "Gem", "Item", "ItemSet", "Slot", "Spec", "Input"].includes(name),
})

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
})

export interface BuildPatch {
  items?: {
    itemList?: Array<{ id: number; rawText: string }>
    slots?: Record<string, number>
  }
  tree?: {
    allocNodes?: number[]
    classId?: number
    ascendClassId?: number
  }
  skills?: Array<{
    index: number
    gems?: Array<{ index: number; level?: number; quality?: number; enabled?: boolean }>
  }>
  config?: Record<string, unknown>
  mainSocketGroup?: number
}

export function applyPatch(originalXml: string, patch: BuildPatch): string {
  const doc = parser.parse(originalXml)
  const root = doc.PathOfBuilding

  if (patch.items) {
    const itemsNode = root.Items
    if (patch.items.itemList && itemsNode?.Item) {
      for (const itemPatch of patch.items.itemList) {
        const item = itemsNode.Item.find(
          (i: any) => parseInt(i["@_id"], 10) === itemPatch.id
        )
        if (item) {
          item["#text"] = "\n" + itemPatch.rawText + "\n"
        }
      }
    }
    if (patch.items.slots && itemsNode?.ItemSet) {
      const itemSet = itemsNode.ItemSet[0] ?? itemsNode.ItemSet
      if (itemSet?.Slot) {
        for (const slot of itemSet.Slot) {
          const slotName = slot["@_name"]
          if (patch.items.slots[slotName] !== undefined) {
            slot["@_itemId"] = String(patch.items.slots[slotName])
          }
        }
      }
    }
  }

  if (patch.tree) {
    const spec = root.Tree?.Spec?.[0] ?? root.Tree?.Spec
    if (spec) {
      if (patch.tree.allocNodes) {
        spec["@_nodes"] = patch.tree.allocNodes.join(",")
      }
      if (patch.tree.classId !== undefined) {
        spec["@_classId"] = String(patch.tree.classId)
      }
      if (patch.tree.ascendClassId !== undefined) {
        spec["@_ascendClassId"] = String(patch.tree.ascendClassId)
      }
    }
  }

  if (patch.skills) {
    const allSkills = collectSkills(root.Skills)
    for (const skillPatch of patch.skills) {
      const skill = allSkills[skillPatch.index]
      if (!skill || !skillPatch.gems) continue
      for (const gemPatch of skillPatch.gems) {
        const gem = skill.Gem?.[gemPatch.index]
        if (!gem) continue
        if (gemPatch.level !== undefined) gem["@_level"] = String(gemPatch.level)
        if (gemPatch.quality !== undefined) gem["@_quality"] = String(gemPatch.quality)
        if (gemPatch.enabled !== undefined) gem["@_enabled"] = String(gemPatch.enabled)
      }
    }
  }

  if (patch.mainSocketGroup !== undefined && root.Build) {
    root.Build["@_mainSocketGroup"] = String(patch.mainSocketGroup)
  }

  if (patch.config && root.Config) {
    for (const [name, value] of Object.entries(patch.config)) {
      const input = (root.Config.Input ?? []).find(
        (i: any) => i["@_name"] === name
      )
      if (input) {
        if (typeof value === "boolean") input["@_boolean"] = String(value)
        else if (typeof value === "number") input["@_number"] = String(value)
        else input["@_string"] = String(value)
      }
    }
  }

  return builder.build(doc)
}

function collectSkills(skillsNode: any): any[] {
  if (!skillsNode) return []
  const sets = skillsNode.SkillSet ?? [skillsNode]
  return sets.flatMap((s: any) => s.Skill ?? [])
}

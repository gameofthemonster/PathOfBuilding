import type { BuildConfig, SocketGroup, GemInstance, Item } from "../client/types"

/**
 * 从 POB XML 文本中提取 BuildConfig。
 * 使用正则 + 简单属性解析方式。
 */
export function parseBuildXml(xml: string): BuildConfig {
  // 提取 Build 标签属性
  const buildMatch = xml.match(/<Build\s+([^>]*)>/)
  const buildAttrs = buildMatch ? parseAttributes(buildMatch[1]) : {}

  // 提取 Tree > Spec
  const specMatch = xml.match(/<Spec\s+([^>]*)/)
  const specAttrs = specMatch ? parseAttributes(specMatch[1]) : {}

  const allocNodes = specAttrs["nodes"]
    ? specAttrs["nodes"].trim().split(/\s+/).filter(Boolean).map(Number)
    : []

  // 提取 Skills
  const skills = parseSkills(xml)

  // 提取 Items
  const items = parseItems(xml)

  // 提取 Config
  const config = parseConfig(xml)

  return {
    level: parseInt(buildAttrs["level"] ?? "1", 10),
    className: buildAttrs["className"] ?? "Scion",
    ascendClassName: buildAttrs["ascendClassName"] ?? "None",
    skills,
    tree: {
      treeVersion: specAttrs["treeVersion"] ?? buildAttrs["treeVersion"] ?? "3_28",
      classId: parseInt(specAttrs["classId"] ?? "0", 10),
      ascendClassId: parseInt(specAttrs["ascendClassId"] ?? "0", 10),
      allocNodes,
    },
    items,
    config,
  }
}

/** 解析 XML 属性字符串为键值对 */
function parseAttributes(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) {
    result[m[1]] = m[2]
  }
  return result
}

/** 解析 Skills 段落 */
function parseSkills(xml: string): SocketGroup[] {
  const skillsMatch = xml.match(/<Skills>([\s\S]*?)<\/Skills>/)
  if (!skillsMatch) return []

  const skillsXml = skillsMatch[1]
  const groups: SocketGroup[] = []

  const groupRe = /<SocketGroup\s+([^>]*)>([\s\S]*?)<\/SocketGroup>/g
  let gm: RegExpExecArray | null
  while ((gm = groupRe.exec(skillsXml)) !== null) {
    const attrs = parseAttributes(gm[1])
    const gemsXml = gm[2]

    const gems: GemInstance[] = []
    const gemRe = /<Gem\s+([^>]*?)\/>/g
    let gem: RegExpExecArray | null
    while ((gem = gemRe.exec(gemsXml)) !== null) {
      const ga = parseAttributes(gem[1])
      gems.push({
        skillId: ga["skillId"] ?? "",
        gemId: ga["gemId"] ?? "",
        nameSpec: ga["nameSpec"] ?? ga["skillId"] ?? "",
        level: parseInt(ga["level"] ?? "20", 10),
        quality: parseInt(ga["quality"] ?? "0", 10),
        qualityId: ga["qualityId"] ?? "Default",
        enabled: ga["enabled"] !== "false",
      })
    }

    groups.push({
      enabled: attrs["enabled"] !== "false",
      label: attrs["label"] ?? "",
      slot: attrs["slot"] ?? "",
      mainActiveSkill: parseInt(attrs["mainActiveSkill"] ?? "1", 10),
      gems,
    })
  }

  return groups
}

/** 解析 Items 段落 */
function parseItems(xml: string): BuildConfig["items"] {
  const itemsMatch = xml.match(/<Items[^>]*>([\s\S]*?)<\/Items>/)
  if (!itemsMatch) return { itemList: [], slots: {} }

  const itemsXml = itemsMatch[1]
  const itemList: Item[] = []

  // 解析 <Item id="N">...</Item>
  const itemRe = /<Item\s+id="(\d+)"[^>]*>([\s\S]*?)<\/Item>/g
  let im: RegExpExecArray | null
  while ((im = itemRe.exec(itemsXml)) !== null) {
    const id = parseInt(im[1], 10)
    const rawText = im[2].trim()

    // 从 rawText 提取 name、base、rarity
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean)
    let rarity = "NORMAL"
    let name = ""
    let base = ""
    let lineIdx = 0

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("Rarity:")) {
        rarity = lines[i].replace("Rarity:", "").trim()
        lineIdx = i + 1
        break
      }
    }

    if (lineIdx < lines.length) name = lines[lineIdx]
    if (lineIdx + 1 < lines.length) base = lines[lineIdx + 1]

    // NORMAL/MAGIC 只有一行（base name）
    if (rarity === "NORMAL" || rarity === "MAGIC") {
      base = name
      name = ""
    }

    itemList.push({ id, rawText, name, base, rarity })
  }

  // 解析 <Slot name="..." itemId="N"/>
  const slots: Record<string, number> = {}
  const slotRe = /<Slot\s+([^>]*?)\/>/g
  let sm: RegExpExecArray | null
  while ((sm = slotRe.exec(itemsXml)) !== null) {
    const sa = parseAttributes(sm[1])
    if (sa["name"] && sa["itemId"]) {
      slots[sa["name"]] = parseInt(sa["itemId"], 10)
    }
  }

  return { itemList, slots }
}

/** 解析 Config 段落 */
function parseConfig(xml: string): Record<string, unknown> {
  const configMatch = xml.match(/<Config>([\s\S]*?)<\/Config>/)
  if (!configMatch) return {}

  const configXml = configMatch[1]
  const config: Record<string, unknown> = {}

  const inputRe = /<Input\s+([^>]*?)\/>/g
  let im: RegExpExecArray | null
  while ((im = inputRe.exec(configXml)) !== null) {
    const attrs = parseAttributes(im[1])
    const name = attrs["name"]
    if (!name) continue

    if (attrs["boolean"] !== undefined) {
      config[name] = attrs["boolean"] === "true"
    } else if (attrs["number"] !== undefined) {
      config[name] = parseFloat(attrs["number"])
    } else if (attrs["string"] !== undefined) {
      config[name] = attrs["string"]
    }
  }

  return config
}

export interface DisplayStat {
  stat: string
  label: string
  value: string
  warn: boolean
  category: string
}

export interface CalcResult {
  stats: Record<string, number>
  warnings: string[]
  displayStats: DisplayStat[]
}

export interface SocketGroup {
  enabled: boolean
  label: string
  slot: string
  mainActiveSkill: number
  gems: GemInstance[]
}

export interface GemInstance {
  skillId: string
  gemId: string
  nameSpec: string
  level: number
  quality: number
  qualityId: string
  enabled: boolean
}

export interface Item {
  id: number
  rawText: string
  name: string
  base: string
  rarity: string
}

export interface BuildConfig {
  level: number
  className: string
  ascendClassName: string
  skills: SocketGroup[]
  tree: {
    treeVersion: string
    classId: number
    ascendClassId: number
    allocNodes: number[]
  }
  items: {
    itemList: Item[]
    slots: Record<string, number>
  }
  config: Record<string, unknown>
}

export interface CalculateResponse {
  sessionId: string
  buildConfig: BuildConfig
  result: CalcResult
}

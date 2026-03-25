import { useState, useEffect } from "react"

let i18nMap: Map<string, string> | null = null

async function loadI18nMap(): Promise<Map<string, string>> {
  if (i18nMap) return i18nMap
  try {
    const res = await fetch("/api/i18n")
    if (!res.ok) throw new Error(`${res.status}`)
    const data: Record<string, string> = await res.json()
    i18nMap = new Map(Object.entries(data))
  } catch {
    i18nMap = new Map()
  }
  return i18nMap
}

export function useI18n() {
  const [map, setMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    loadI18nMap().then(setMap)
  }, [])

  function t(key: string, ...args: (string | number)[]): string {
    let text = map.get(key)
    let effectiveArgs: (string | number)[] = args

    // 直接查找失败且调用方没有传入显式参数时，尝试数字归一化查找
    if (text === undefined && args.length === 0) {
      const nums: string[] = []
      let idx = 0
      const normalized = key.replace(/[+-]?\d+(?:\.\d+)?/g, (m) => {
        nums.push(m)
        return `{${idx++}}`
      })
      if (nums.length > 0) {
        const template = map.get(normalized)
        if (template) {
          text = template
          effectiveArgs = nums
        }
      }
    }

    if (text === undefined) text = key

    // 把参数注入翻译模板中的 {N} 占位符
    for (let i = 0; i < effectiveArgs.length; i++) {
      text = text.replace(`{${i}}`, String(effectiveArgs[i]))
    }

    // 去掉 POB 颜色代码 ^xRRGGBB 和 ^N
    text = text.replace(/\^x[0-9A-Fa-f]{6}/g, "").replace(/\^\d/g, "")
    return text
  }

  return { t }
}

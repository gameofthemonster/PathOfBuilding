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
    let text = map.get(key) ?? key
    for (let i = 0; i < args.length; i++) {
      text = text.replace(`{${i}}`, String(args[i]))
    }
    // 去掉 POB 颜色代码 ^xRRGGBB
    text = text.replace(/\^x[0-9A-Fa-f]{6}/g, "")
    return text
  }

  return { t }
}

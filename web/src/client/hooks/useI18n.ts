import { useState, useEffect } from "react"

let i18nMap: Map<string, string> = new Map()

// 结果缓存：同一 key 只走一次完整查找流程
const _tCache = new Map<string, string>()

// Pre-computed text templates: entries with {N} placeholders that can match any text.
// Built once when the map loads, used for patterns like "Allocates {0}".
interface TextTemplate {
  re: RegExp
  translation: string
}
let textTemplateList: TextTemplate[] = []

function buildTextTemplates(map: Map<string, string>): TextTemplate[] {
  const templates: TextTemplate[] = []
  for (const [key, val] of map.entries()) {
    if (!key.includes("{")) continue
    // Escape regex special chars, then convert {N} into capture groups
    const escaped = key
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{(\d+)\\\}/g, "(.+?)")
    try {
      templates.push({ re: new RegExp(`^${escaped}$`), translation: val })
    } catch { /* skip malformed */ }
  }
  return templates
}

let loadPromise: Promise<void> | null = null
const listeners: Array<() => void> = []

function notifyListeners() {
  listeners.forEach((fn) => fn())
}

function loadI18nMap(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = fetch("/api/i18n")
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status}`)
      return res.json() as Promise<Record<string, string>>
    })
    .then((data) => {
      i18nMap = new Map(Object.entries(data))
      _tCache.clear()
      textTemplateList = buildTextTemplates(i18nMap)
      notifyListeners()
    })
    .catch(() => {})
  return loadPromise
}

// 模块级稳定函数，引用永远不变，不会触发依赖它的 memo/effect 重算
export function t(key: string, ...args: (string | number)[]): string {
  // 无参数调用走缓存，避免对同一 key 重复执行耗时的模板匹配
  if (args.length === 0) {
    const cached = _tCache.get(key)
    if (cached !== undefined) return cached
  }

  const map = i18nMap

  // Strip POB item tag prefixes like {fractured}, {crafted}, {corrupted}
  const cleanKey = key.replace(/^\{[^}]+\}/, "")

  let text = map.get(cleanKey)
  let effectiveArgs: (string | number)[] = args

  // 直接查找失败且调用方没有传入显式参数时，尝试数字归一化查找
  if (text === undefined && args.length === 0) {
    const nums: string[] = []
    let idx = 0
    const normalized = cleanKey.replace(/[+-]?\d+(?:\.\d+)?/g, (m) => {
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

  // 文本占位符匹配：例如 "Allocates Sovereignty" 匹配模板 "Allocates {0}"
  // 只对含空格的 key 尝试（单词不会命中多词模板，且 36K 模板遍历代价极高）
  if (text === undefined && args.length === 0 && cleanKey.includes(" ") && textTemplateList.length > 0) {
    for (const tpl of textTemplateList) {
      const match = cleanKey.match(tpl.re)
      if (match) {
        let result = tpl.translation
        for (let i = 1; i < match.length; i++) {
          const captured = match[i]
          const translatedCapture = map.get(captured) ?? captured
          result = result.replace(`{${i - 1}}`, translatedCapture)
        }
        text = result
        break
      }
    }
  }

  // 复合名称分解：适用于 MAGIC 物品名如 "Dabbler's Quicksilver Flask of the Owl"
  if (text === undefined && args.length === 0) {
    const words = cleanKey.split(" ")
    outer: for (let len = words.length - 1; len >= 1; len--) {
      for (let start = 0; start + len <= words.length; start++) {
        const candidate = words.slice(start, start + len).join(" ")
        if (candidate.startsWith("of ") || candidate === "of") continue
        if (map.has(candidate)) {
          const prefix = words.slice(0, start).join(" ")
          const suffix = words.slice(start + len).join(" ")
          const translatedBase = map.get(candidate)!
          const translatedPrefix = prefix ? (map.get(prefix) ?? prefix) : ""
          const translatedSuffix = suffix ? (map.get(suffix) ?? suffix) : ""
          text = [translatedPrefix, translatedBase, translatedSuffix].filter(Boolean).join("")
          break outer
        }
      }
    }
  }

  if (text === undefined) text = cleanKey

  // 把参数注入翻译模板中的 {N} 占位符
  for (let i = 0; i < effectiveArgs.length; i++) {
    text = text.replace(`{${i}}`, String(effectiveArgs[i]))
  }

  // 去掉 POB 颜色代码 ^xRRGGBB 和 ^N
  text = text.replace(/\^x[0-9A-Fa-f]{6}/g, "").replace(/\^\d/g, "")

  if (args.length === 0) _tCache.set(key, text)
  return text
}

// hook 只负责触发组件在翻译表加载后重渲
export function useI18n() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    let cancelled = false
    const trigger = () => { if (!cancelled) forceUpdate((n) => n + 1) }
    listeners.push(trigger)
    loadI18nMap()
    return () => {
      const idx = listeners.indexOf(trigger)
      if (idx >= 0) listeners.splice(idx, 1)
      cancelled = true
    }
  }, [])

  return { t }
}

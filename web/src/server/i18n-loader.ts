import { readdir, readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const I18N_DIR = path.join(__dirname, "../../i18n/zh-CN")

let translationMap: Map<string, string> | null = null

export async function loadTranslations(): Promise<Map<string, string>> {
  if (translationMap) return translationMap
  translationMap = new Map()

  let files: string[]
  try {
    files = await readdir(I18N_DIR)
  } catch {
    console.warn("[i18n] i18n/zh-CN/ not found, translations disabled")
    return translationMap
  }

  for (const file of files.filter((f) => f.endsWith(".csv"))) {
    const content = await readFile(path.join(I18N_DIR, file), "utf-8")
    const lines = content.split("\n")
    for (const line of lines) {
      const commaIdx = line.indexOf(",")
      if (commaIdx === -1) continue
      // 去除两端的双引号（PoeCharm2 CSV 部分 key 带引号）
      let en = line.slice(0, commaIdx).trim()
      let zh = line.slice(commaIdx + 1).trim()
      if (en.startsWith('"') && en.endsWith('"')) en = en.slice(1, -1)
      if (zh.startsWith('"') && zh.endsWith('"')) zh = zh.slice(1, -1)
      if (en && zh) translationMap.set(en, zh)
    }
  }

  console.log(`[i18n] Loaded ${translationMap.size} translations`)
  return translationMap
}

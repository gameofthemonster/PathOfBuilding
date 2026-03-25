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
      // Proper two-field quoted-CSV parser.
      // A quoted field starts with " and ends at the next " followed by , or EOL.
      // "" inside a quoted field represents a literal ".
      // An unquoted field ends at the first ,.
      const parseField = (s: string, pos: number): [string, number] => {
        if (s[pos] === '"') {
          // Quoted field
          let field = ""
          let i = pos + 1
          while (i < s.length) {
            if (s[i] === '"') {
              if (s[i + 1] === '"') {
                // Escaped double-quote
                field += '"'
                i += 2
              } else {
                // End of quoted field; skip closing quote
                i += 1
                break
              }
            } else {
              field += s[i]
              i += 1
            }
          }
          // Skip the comma separator if present
          if (s[i] === ",") i += 1
          return [field, i]
        } else {
          // Unquoted field
          const commaIdx = s.indexOf(",", pos)
          if (commaIdx === -1) return [s.slice(pos), s.length]
          return [s.slice(pos, commaIdx), commaIdx + 1]
        }
      }

      const trimmed = line.trim()
      if (!trimmed) continue

      const [en, afterKey] = parseField(trimmed, 0)
      if (afterKey >= trimmed.length) continue // no second field
      const [zh] = parseField(trimmed, afterKey)

      if (en && zh) translationMap.set(en, zh)
    }
  }

  console.log(`[i18n] Loaded ${translationMap.size} translations`)
  return translationMap
}

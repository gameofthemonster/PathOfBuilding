// 下载 PoeCharm2 的中文翻译 CSV 到 web/i18n/zh-CN/
import { mkdir } from "fs/promises"

const BASE_URL =
  "https://raw.githubusercontent.com/Chuanhsing/PoeCharm2/main/Data/Translate/zh-rCN"

const CSV_FILES = [
  "StatDescriptions.csv",
  "passive_skill_stat_descriptions.csv",
  "skill_stat_descriptions.csv",
  "gem_stat_descriptions.csv",
]

await mkdir("i18n/zh-CN", { recursive: true })

for (const file of CSV_FILES) {
  const url = `${BASE_URL}/${file}`
  console.log(`Downloading ${file}...`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`  Failed: ${res.status} ${res.statusText}`)
      continue
    }
    const text = await res.text()
    await Bun.write(`i18n/zh-CN/${file}`, text)
    console.log(`  OK (${text.length} bytes)`)
  } catch (e) {
    console.warn(`  Error: ${e}`)
  }
}
console.log("Done.")

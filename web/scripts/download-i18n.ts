// 下载 PoeCharm2 的中文翻译 CSV 到 web/i18n/zh-CN/
import { mkdir } from "fs/promises"

const BASE_URL =
  "https://raw.githubusercontent.com/Chuanhsing/PoeCharm2/main/Data/Translate/zh-rCN"

// 选取对 POB Web 最有用的翻译文件
const CSV_FILES = [
  "BuildDisplayStats.csv",   // 数值面板标签
  "ConfigOptions.csv",       // 配置选项
  "GUI.csv",                 // 通用 UI 文本
  "CalcsTab.csv",            // 计算面板
  "Items_Gems.csv",          // 宝石名称
  "SkillsTab.csv",           // 技能 Tab
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

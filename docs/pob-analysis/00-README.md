# POB 代码库分析文档

本目录记录了对 Path of Building Community (POB) 代码库的深度分析结果，
为后续开发 Web 分析界面提供技术支撑。

## 文档索引

| 文件 | 内容 |
|------|------|
| [01-architecture.md](./01-architecture.md) | 整体架构、目录结构、模块关系 |
| [02-build-string.md](./02-build-string.md) | Build 字符串格式、解析流程、XML 结构 |
| [03-headless-execution.md](./03-headless-execution.md) | HeadlessWrapper 无界面运行机制 |
| [04-calculation-engine.md](./04-calculation-engine.md) | 计算引擎流水线、输入输出结构 |
| [05-display-stats.md](./05-display-stats.md) | 展示统计数据定义、警告系统 |
| [06-skills-gems.md](./06-skills-gems.md) | 技能石插槽、宝石实例、技能数据 |
| [07-passive-tree.md](./07-passive-tree.md) | 被动技能树数据结构 |
| [08-items.md](./08-items.md) | 装备解析、词缀系统、装备槽 |
| [09-data-files.md](./09-data-files.md) | 自动生成的数据文件清单与说明 |
| [10-test-infrastructure.md](./10-test-infrastructure.md) | 测试框架与 CI 机制 |

## 核心结论（快速参考）

### Build 字符串解码
```
base64url_decode(string) → zlib_decompress → XML 文本
```
- URL 安全的 base64：`-` 替代 `+`，`_` 替代 `/`
- 解压后是 `<PathOfBuilding>` 根节点的 XML

### 无界面运行入口
```lua
dofile("HeadlessWrapper.lua")   -- 初始化
loadBuildFromXML(xmlText)        -- 加载 build
runCallback("OnFrame")           -- 触发计算
local output = build.calcsTab.mainOutput  -- 获取结果
local warnings = build.controls.warnings.lines  -- 获取警告
```

### 关键文件大小（评估加载成本）
| 文件 | 大小 |
|------|------|
| `src/Data/ModCache.lua` | 2.2 MB |
| `src/Data/ModItem.lua` | 3.9 MB |
| `src/Modules/ModParser.lua` | 630 KB |
| `src/Modules/ConfigOptions.lua` | 235 KB |
| `src/Data/Gems.lua` | 396 KB |
| `src/Data/Crucible.lua` | 1 MB |

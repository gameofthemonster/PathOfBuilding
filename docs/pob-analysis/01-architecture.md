# POB 整体架构

## 目录结构

```
PathOfBuilding/
├── runtime/                   # Windows 可执行文件 + DLL（LuaJIT 5.1, zlib, curl 等）
│   └── lua/                   # Lua 标准库
├── src/                       # 全部 Lua 源码
│   ├── Launch.lua             # 启动入口，Dev 模式检测，加载 Main
│   ├── HeadlessWrapper.lua    # 无界面运行桩（测试/服务端用）
│   ├── GameVersions.lua       # 游戏版本常量与被动树版本映射
│   ├── Modules/               # 核心业务模块
│   ├── Classes/               # UI 控件 + 业务类
│   ├── Data/                  # 自动生成的游戏数据（不手动编辑）
│   ├── TreeData/              # 被动树数据（各版本压缩包）
│   └── Export/                # GGPK 导出脚本（生成 Data/ 下的文件）
├── spec/                      # 测试套件（Busted）
│   ├── System/                # 系统级测试（加载 build、断言 output）
│   └── TestBuilds/            # 测试用 build XML + 期望输出
├── docs/                      # 文档
└── docker-compose.yml         # 运行测试的 Docker 环境
```

## 运行模式

POB 有两种运行模式，在 `Main.lua` 中通过 `modes` 切换：

| 模式 | 说明 |
|------|------|
| `LIST` | Build 列表界面，管理本地保存的 build 文件 |
| `BUILD` | Build 编辑/分析界面，加载单个 build 进行计算和展示 |

## 核心模块关系

```
Launch.lua
  └── Main.lua (modes: LIST / BUILD)
        └── BUILD 模式 → Build.lua
              ├── CalcsTab → Calcs.lua (计算引擎入口)
              │     ├── CalcSetup.lua    (初始化 ModDB 环境)
              │     ├── CalcPerform.lua  (执行计算)
              │     ├── CalcOffence.lua  (伤害计算)
              │     ├── CalcDefence.lua  (防御计算)
              │     ├── CalcActiveSkill.lua (技能计算)
              │     ├── CalcTriggers.lua (触发机制)
              │     └── CalcMirages.lua  (幻像计算)
              ├── SkillsTab → SkillsTab.lua (技能石管理)
              ├── ItemsTab  → ItemsTab.lua  (装备管理)
              ├── TreeTab   → TreeTab.lua + PassiveTree.lua + PassiveSpec.lua
              ├── ImportTab → ImportTab.lua (字符串导入)
              ├── ConfigTab → ConfigTab.lua + ConfigOptions.lua
              └── BuildDisplayStats.lua (侧边栏数据定义)
```

## 关键依赖模块

| 模块 | 职责 |
|------|------|
| `Common.lua` | 工具函数：class 库、base64、JSON、table 操作、hash |
| `Data.lua` | 加载所有游戏数据（技能、词缀、装备基础、附魔等） |
| `ModTools.lua` | `mod()` / `flag()` 函数，加载 ModCache |
| `ModParser.lua` | 解析词缀文本 → 结构化 mod（Dev 模式下运行，生成 ModCache） |
| `ItemTools.lua` | 装备词缀值范围计算、文本着色 |
| `StatDescriber.lua` | 将内部 stat 转换为可读文本 |

## 数据流向（简化）

```
用户输入 Build 字符串
  ↓  base64url decode + zlib decompress
XML 文本
  ↓  ParseXML
内存结构（Build sections）
  ↓  各 Tab 的 Load()
Build 对象（被动节点、技能石、装备、配置）
  ↓  calcs.initEnv()
计算环境（ModDB for player/enemy/minion）
  ↓  calcs.perform()
output 表（所有 stat 值）
  ↓  BuildDisplayStats 过滤、格式化
侧边栏展示 + 警告信息
```

## 技术栈

- **语言**：Lua 5.1（LuaJIT，使用 `bit.*` 库进行位运算）
- **运行时**：Windows：`runtime/lua51.dll`（LuaJIT）；测试：Docker + LuaJIT
- **无图形依赖**：`HeadlessWrapper.lua` 桩掉所有渲染调用，使引擎可脱离 GUI 运行
- **压缩**：zlib（`Inflate`/`Deflate`），通过 `runtime/lzip.dll` 或 Lua 绑定
- **网络**：libcurl（仅用于 build 分享、交易 API）

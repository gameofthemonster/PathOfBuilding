# HeadlessWrapper：无界面运行机制

## 用途

`src/HeadlessWrapper.lua` 是 POB 引擎的"无头"运行适配器。它桩掉所有图形渲染和平台相关调用，使整个计算引擎可以在没有 GUI 的环境中运行（CI 测试、服务端计算）。

Busted 测试框架（`docker-compose.yml`）就是使用这个机制运行的。

## HeadlessWrapper 提供的存根

```lua
-- 渲染相关（全部为 no-op）
function RenderInit(...) end
function DrawImage(...) end
function DrawString(...) end
function SetDrawColor(...) end
-- ... 约 30+ 个渲染函数

-- 平台功能
function GetScreenSize() return 1920, 1080 end
function GetScriptPath() return "" end
function LoadModule(fileName, ...)   -- 加载 Lua 文件（实际执行）
function ConPrintf(fmt, ...) print(string.format(fmt, ...)) end

-- ⚠️ 关键：Inflate/Deflate 需要自行实现
function Inflate(data)
    -- TODO: 需要实现 zlib decompress
    return ""
end
function Deflate(data)
    -- TODO: 需要实现 zlib compress
    return ""
end
```

**重要**：`Inflate`/`Deflate` 在 HeadlessWrapper 中是空实现（有 TODO 注释）。如果要通过 HeadlessWrapper 解析 base64 字符串，需要在外部先解码，直接传入 XML 文本。测试用例也是这样做的——直接传 XML，绕过 base64 解码。

## 完整运行流程

```lua
-- 1. 加载 HeadlessWrapper（桩掉所有 GUI 调用）
dofile("src/HeadlessWrapper.lua")

-- 初始化自动执行（HeadlessWrapper 末尾）：
-- runCallback("OnInit")   -- 加载 Main.lua、Data.lua 等
-- runCallback("OnFrame")  -- 第一帧，完成初始化

-- 2. 此时 mainObject.main.modes["BUILD"] 就是 build 模块
build = mainObject.main.modes["BUILD"]

-- 3. 从 XML 加载 build
loadBuildFromXML(xmlText, "build name")
runCallback("OnFrame")  -- 触发计算

-- 4. 获取计算结果
local output = build.calcsTab.mainOutput
print(output.TotalDPS)        -- 主技能 DPS
print(output.Life)             -- 生命值
print(output.FireResist)       -- 火焰抗性

-- 5. 获取警告信息
local warnings = build.controls.warnings.lines
for k, v in pairs(warnings) do
    print(v)
end
```

## 等效的 JSON 输出脚本

下面是一个完整的 Lua 脚本示例，可以通过 LuaJIT 命令行运行，输入 XML 字符串，输出 JSON 格式的计算结果：

```lua
-- run_calc.lua
-- 用法: luajit run_calc.lua <xml_file_path>

-- 切换到 src 目录
package.path = package.path .. ";src/?.lua;src/?/init.lua"
package.cpath = package.cpath .. ";runtime/?.dll;runtime/lib/?.so"

dofile("src/HeadlessWrapper.lua")

-- 读取 XML 参数
local xmlFile = arg[1]
local f = io.open(xmlFile, "r")
local xmlText = f:read("*a")
f:close()

loadBuildFromXML(xmlText, "calc_build")
runCallback("OnFrame")

-- 提取所有 output 值并转为 JSON
local output = build.calcsTab.mainOutput
local json = require("json")  -- 需要 lua-json 库

local result = {
    stats = {},
    warnings = build.controls.warnings.lines or {}
}

for k, v in pairs(output) do
    if type(v) == "number" or type(v) == "boolean" or type(v) == "string" then
        result.stats[k] = v
    end
end

print(json.encode(result))
```

## 启动时加载的模块链

HeadlessWrapper 执行 `dofile("Launch.lua")` 后，`OnInit` 回调触发以下加载顺序：

```
Launch.lua → OnInit
  → Main.lua
      → Common.lua      (工具函数、base64、XML 解析)
      → Data.lua        (加载全部游戏数据文件)
          → Gems.lua, ModCache.lua, ModItem.lua, ... (大量数据文件)
      → ModTools.lua    (加载 ModCache)
      → ItemTools.lua
      → CalcTools.lua
      → Calcs.lua       (加载计算引擎)
          → CalcSetup.lua, CalcPerform.lua, CalcOffence.lua ...
```

**首次启动耗时估计**（取决于硬件，数据文件很大）：
- Dev 模式会重新生成 ModCache（慢，几十秒）
- 正常运行读取预生成的 ModCache（快，1-3 秒）

## CI 模式（continuousIntegrationMode）

```lua
-- HeadlessWrapper.lua 末尾
mainObject.continuousIntegrationMode = os.getenv("CI")
```

当环境变量 `CI=true` 时，POB 跳过 ModCache 的加载（避免大文件带来的 CI 延迟），这意味着在 CI 环境中不能使用依赖 ModCache 的功能。

## 关键变量速查

| 变量 | 说明 |
|------|------|
| `mainObject` | POB 主对象（通过 `SetMainObject()` 注册） |
| `mainObject.main` | Main 模块实例 |
| `mainObject.main.modes["BUILD"]` | Build 模块实例（即 `build` 变量） |
| `build.calcsTab` | CalcsTab 实例 |
| `build.calcsTab.mainOutput` | 当前主技能的全部计算输出 |
| `build.calcsTab.mainEnv` | 当前计算环境（含 modDB、player、enemy 等） |
| `build.controls.warnings.lines` | 警告消息列表（table，key 为警告文本） |
| `build.skillsTab.socketGroupList` | 所有插槽组列表 |
| `build.spec` | 当前被动树规格（PassiveSpec 实例） |
| `build.itemsTab.itemList` | 装备列表 |

## 服务端实现建议

对于 Web 服务端（Go 或 Node.js）调用 POB 计算引擎：

1. **子进程方式**：启动 `luajit` 子进程，传入自定义 Lua 脚本
   - 优点：最简单，完全复用 POB 脚本
   - 缺点：每次请求启动进程开销大（可通过进程池优化）

2. **长驻进程 + stdin/stdout 通信**：启动 LuaJIT 长驻进程，通过管道通信
   - 优点：复用初始化开销（Data.lua 加载一次）
   - 缺点：需要自己管理进程生命周期

3. **gopher-lua 方式**（Go）：内嵌 Lua 5.1 解释器
   - 优点：进程内调用，无需子进程
   - 缺点：gopher-lua 无 JIT，计算可能较慢；需要处理 `bit.*` 库兼容性

# 测试框架与 CI 机制

## 测试框架

POB 使用 [Busted](https://lunarmodules.github.io/busted/) 框架，通过 Docker 运行：

```bash
# 运行全部测试
docker-compose up

# docker-compose.yml 内容：
# image: ghcr.io/pathofbuildingcommunity/pathofbuilding-tests:latest
# command: busted --lua=luajit
# working_dir: /workdir
# volumes: ./:/workdir:ro
```

## 测试配置（.busted）

```lua
return {
    _all = {
        coverage = false,
        verbose = true,
    },
    default = {
        directory = "src",
        lpath = "../runtime/lua/?.lua;../runtime/lua/?/init.lua",
        helper = "HeadlessWrapper.lua",   -- 关键：桩掉 GUI
        ROOT = { "../spec" },
        ["exclude-tags"] = "builds",      -- 默认排除 #builds 标签（太慢）
    },
    generate = {
        directory = "src",
        lpath = "../runtime/lua/?.lua;../runtime/lua/?/init.lua",
        helper = "HeadlessWrapper.lua",
        ROOT = { "../spec/GenerateBuilds.lua" },  -- 生成 TestBuilds 期望值
    }
}
```

## 测试文件结构

```
spec/
├── System/
│   ├── TestBuilds_spec.lua     -- 加载 TestBuilds 验证计算结果
│   ├── TestAttacks_spec.lua    -- 攻击计算测试
│   ├── TestDefence_spec.lua    -- 防御计算测试
│   ├── TestAilments_spec.lua   -- 异常状态测试
│   ├── TestImpale_spec.lua     -- 穿刺机制测试
│   ├── TestItemMods_spec.lua   -- 装备词缀测试
│   ├── TestItemParse_spec.lua  -- 装备解析测试
│   ├── TestSkills_spec.lua     -- 技能测试
│   └── TestTradeQueryCurrency_spec.lua
└── TestBuilds/
    └── 3.13/                   -- 按游戏版本分目录
        ├── OccVortex.lua       -- 测试 build 数据 + 期望输出
        ├── OccVortex.xml       -- 对应的 build XML
        └── ...
```

## TestBuilds 格式

每个 `TestBuilds/` 下的 Lua 文件返回一个包含 XML 和期望输出的表：

```lua
-- spec/TestBuilds/3.13/OccVortex.lua
return {
    xml = [[<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
    <Build level="99" className="Witch" ascendClassName="Occultist" ...>
        <PlayerStat stat="TotalDot" value="566925.51596343"/>
        ...
    </Build>
    <Skills>...</Skills>
    <Tree>...</Tree>
    <Items>...</Items>
</PathOfBuilding>]],

    -- 期望的计算输出值
    output = {
        TotalDot = 566925.51596343,
        CombinedDPS = 567004.71046343,
        Life = 7239,
        EnergyShield = 0,
        ...
    }
}
```

## TestBuilds_spec.lua 工作原理

```lua
-- 加载全部 TestBuilds
local buildList = fetchBuilds("../spec/TestBuilds")

for buildName, testBuild in pairs(buildList) do
    -- 加载 XML 到 POB 引擎
    loadBuildFromXML(testBuild.xml, buildName)

    for key, expectedValue in pairs(testBuild.output) do
        local actualValue = build.calcsTab.mainOutput[key]

        it("build: " .. buildName .. ", key: " .. key, function()
            -- 对比精度：保留 4 位小数
            assert.are.same(
                round(expectedValue, 4),
                round(actualValue or 0, 4)
            )
        end)
    end
end
```

## 如何添加新测试

1. 创建对应的 XML 文件（从 POB 导出 build 字符串，解码后即为 XML）
2. 创建同名 Lua 文件，填写 `output` 中需要验证的 stat key-value
3. 运行 `docker-compose up` 验证
4. 如果计算修改影响了已有测试，更新期望值并说明原因

## GenerateBuilds 工具

```lua
-- spec/GenerateBuilds.lua
-- 作用：从已有的 XML build 文件自动生成期望输出值
-- 运行方式：busted --config-file=.busted generate
```

## CI 环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `CI` | `true` | Github Actions 中自动设置 |
| 效果 | 跳过 ModCache 加载 | 避免 2.2MB 大文件的加载时间 |

## 服务端调试参考

可以参考测试框架的模式来构建服务端调用脚本：

```lua
-- server_calc.lua（服务端计算脚本示例）
-- 与 HeadlessWrapper 的 helper 用法类似

-- 1. 外部解码 base64 + zlib 后得到 XML 文本
-- 2. 调用 loadBuildFromXML(xmlText, "request_" .. requestId)
-- 3. runCallback("OnFrame")
-- 4. 序列化 build.calcsTab.mainOutput 为 JSON
-- 5. 序列化 build.controls.warnings.lines 为 JSON 数组
-- 6. 输出到 stdout，Go/Node 服务端读取

local output = build.calcsTab.mainOutput
local warnings = {}
for k, _ in pairs(build.controls.warnings.lines) do
    table.insert(warnings, k)
end

-- 使用 json.encode 序列化（需要 lua-json 或类似库）
local result = {
    stats = extract_numeric_stats(output),
    skillDPS = output.SkillDPS,      -- 技能 DPS 列表
    fullDPS = output.FullDPS,
    warnings = warnings,
}
print(json.encode(result))
```

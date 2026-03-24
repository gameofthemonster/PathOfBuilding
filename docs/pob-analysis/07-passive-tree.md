# 被动技能树

## 数据结构

```
Build
  └── spec  (PassiveSpec 实例)
        ├── tree        -- PassiveTree 实例（静态树定义）
        ├── nodes       -- 当前规格可用节点 map（nodeId → node）
        ├── allocNodes  -- 已分配节点 map（nodeId → node）
        ├── classId     -- 职业 ID（0-6）
        ├── ascendClassId -- 升华职业 ID
        └── treeVersion -- 使用的树版本字符串
```

## XML 格式（被动树 Section）

```xml
<Tree activeSpec="1">
  <Spec title="主流派"
        treeVersion="3_21"
        classId="3"          <!-- 0=Scion 1=Marauder 2=Ranger 3=Witch 4=Duelist 5=Templar 6=Shadow -->
        ascendClassId="1"    <!-- 升华职业 ID，0=未选 -->
        nodes="12345,67890,111222,...">    <!-- 已分配天赋节点 ID，逗号分隔 -->
    <!-- 可能还有 Mastery 选择、Cluster Jewel 节点等 -->
    <MasteryEffect effectId="1234" nodeId="5678"/>
    <Socket nodeId="9999" itemId="3"/>    <!-- 宝珠插槽关联 -->
  </Spec>
</Tree>
```

## 职业与升华对应

```lua
-- classId → 职业名
[0] = "Scion"
[1] = "Marauder"
[2] = "Ranger"
[3] = "Witch"
[4] = "Duelist"
[5] = "Templar"
[6] = "Shadow"

-- 升华职业（各职业的 ascendClassId 1-3）
Witch:    1=Necromancer, 2=Elementalist, 3=Occultist
Marauder: 1=Juggernaut,  2=Berserker,    3=Chieftain
Ranger:   1=Deadeye,     2=Raider,       3=Pathfinder
Duelist:  1=Slayer,      2=Gladiator,    3=Champion
Templar:  1=Inquisitor,  2=Hierophant,   3=Guardian
Shadow:   1=Assassin,    2=Saboteur,     3=Trickster
Scion:    1=Ascendant
```

## 节点类型

```lua
node.type:
  "normal"    -- 普通小节点
  "keystone"  -- 天赋石（大圆节点）
  "notable"   -- 显著天赋（中圆节点）
  "socket"    -- 宝珠插槽
  "mastery"   -- 精通节点
  "ascendancy" -- 升华节点
  "class"     -- 职业起点节点
```

## PassiveTree 数据加载

树数据存储在压缩包 `TreeData/`（各版本独立文件），初始化时解压加载：

```lua
-- PassiveTree.lua
local PassiveTreeClass = newClass("PassiveTree", function(self, treeVersion)
    -- 从 TreeData/<version>/ 读取 tree.lua
    -- 包含：nodes{}, groups{}, min/max 坐标，职业起点等
end)
```

树数据的核心结构 `tree.nodes[id]`：
```lua
node = {
    id       = 12345,
    name     = "Master of Force",
    type     = "notable",
    x        = 1234.5, y = 678.9,  -- 坐标（用于可视化）
    icon     = "Art/...",
    mods     = { "10% increased Strength", ... },  -- 原始词缀文本
    modList  = ModList,    -- 解析后的 mod 列表
    linked   = { node1, node2, ... },  -- 相邻节点
    -- 升华相关
    ascendancyName = "Occultist",
    isAscendancyStart = false,
    -- keystone 相关
    keystoneThreshold = 40,
}
```

## PassiveSpec 关键方法

```lua
-- 加载 XML（从 Build 的 Load 流程调用）
PassiveSpecClass:Load(xml)
  -- 解析 nodes 属性（逗号分隔的 ID 列表）
  -- 填充 self.allocNodes

-- 保存 XML
PassiveSpecClass:Save(xml)
  -- 将 self.allocNodes 的 ID 序列化为逗号字符串

-- 计算已用点数
local count = PassiveSpecClass:CountAllocNodes()
```

## 在计算中的用途

`CalcSetup.lua` 遍历 `build.spec.allocNodes`，对每个已分配节点调用 `calcs.buildModListForNode(env, node)`，将节点的词缀（`node.modList`）合并到 `env.player.modDB` 中。

宝珠（Jewel）对树节点的影响也在这一步处理：半径宝珠的修改函数会在每个节点处被调用。

## 时空宝珠（Timeless Jewels）

时空宝珠（军团宝珠）会将树上指定半径内的节点替换为时空词缀，这是 POB 中最复杂的被动树机制之一：

```lua
-- build.timelessData 存储时空宝珠配置
build.timelessData = {
    jewelType = {},        -- 宝珠类型（Glorious Vanity 等）
    conquerorType = {},    -- 征服者类型
    devotionVariant1/2 = 1, -- 虔诚变体
    jewelSocket = {},      -- 宝珠所在插槽
    ...
}
```

## 天赋树版本

POB 支持多个历史版本的天赋树（用于查看旧版 build）：

```lua
-- src/GameVersions.lua
treeVersions = {
    ["2_6"] = { num = 260, ... },
    ["3_0"] = { num = 300, ... },
    ...
    ["3_21"] = { num = 3210, ... },  -- 当前版本
}
```

树数据压缩包位于项目根目录：`tree-2_6.zip`, `tree-3_6.zip` 等，按需解压到 `src/TreeData/<version>/`。

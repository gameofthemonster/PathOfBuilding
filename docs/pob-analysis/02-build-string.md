# Build 字符串格式与解析

## 字符串格式

POB 的 Build 分享字符串是一个经过压缩和编码的 XML：

```
Build 字符串 = base64url_encode( zlib_deflate( XML 文本 ) )
```

**base64 变体**：使用 URL-safe base64
- `+` → `-`
- `/` → `_`

**对应 POB 源码**（`ImportTab.lua:190`）：
```lua
-- 生成分享码
local code = common.base64.encode(Deflate(self.build:SaveDB("code")))
                :gsub("+","-"):gsub("/","_")

-- 解析分享码（ImportTab.lua:294）
local xmlText = Inflate(common.base64.decode(buf:gsub("-","+"):gsub("_","/")))
```

## XML 根结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="99" targetVersion="3_0" className="Witch" ascendClassName="Occultist"
         mainSocketGroup="5" viewMode="CALCS" pantheonMajorGod="None" pantheonMinorGod="None"
         bandit="None">
    <!-- 存储最后一次计算的 PlayerStat（只用于展示，不参与计算）-->
    <PlayerStat stat="TotalDPS" value="12345.6"/>
    ...
  </Build>

  <Skills>
    <!-- 技能石插槽组 -->
    <SkillSet id="1">
      <Skill enabled="true" includeInFullDPS="true" slot="Body Armour"
             mainActiveSkill="1" label="">
        <Gem skillId="SpectralThrow" level="20" quality="20" enabled="true"/>
        <Gem skillId="MultistrikeSupportPlus" level="20" quality="20" enabled="true"/>
        ...
      </Skill>
    </SkillSet>
  </Skills>

  <Tree activeSpec="1">
    <!-- 被动树快照 -->
    <Spec title="" treeVersion="3_21" ascendClassId="1" classId="3"
          nodes="12345,67890,..." masteryEffects="{...}">
      <!-- 天赋节点 ID 列表（逗号分隔） -->
    </Spec>
  </Tree>

  <Items activeItemSet="1">
    <!-- 装备槽与装备数据 -->
    <Item id="1">
      Rarity: UNIQUE
      Shaper's Touch
      Eelskin Gloves
      ...
    </Item>
    <ItemSet>
      <Slot name="Gloves" itemId="1"/>
      ...
    </ItemSet>
  </Items>

  <Config>
    <!-- 配置选项（Buff、条件、地图词缀等） -->
    <Input name="conditionKilledRecently" boolean="true"/>
    <Input name="enemyIsBoss" string="Pinnacle"/>
  </Config>

  <Notes>
    <!-- 用户文字备注（富文本） -->
  </Notes>
</PathOfBuilding>
```

## 各 Section 用途

| Section | XML 元素 | 负责模块 | 说明 |
|---------|----------|----------|------|
| Build 基础信息 | `<Build>` | `Build.lua` | 等级、职业、天赋方向、主技能组 |
| 技能石 | `<Skills>` | `SkillsTab.lua` | 所有插槽组和宝石配置 |
| 被动树 | `<Tree>` | `PassiveSpec.lua` | 分配的天赋节点列表 |
| 装备 | `<Items>` | `ItemsTab.lua` | 装备文本（可直接从游戏 Ctrl+C 复制）|
| 配置 | `<Config>` | `ConfigTab.lua` | Buff/状态/boss/地图词缀开关 |
| 备注 | `<Notes>` | `NotesTab.lua` | 用户自定义文字 |
| 导入链接 | `<Import>` | `Build.lua` | 记录原始导入 URL（用于同步更新）|

## 关键字段

### Build 元素属性

| 属性 | 说明 |
|------|------|
| `level` | 角色等级（1-100） |
| `targetVersion` | 游戏版本（如 `3_0`） |
| `className` | 职业名（Witch、Duelist 等） |
| `ascendClassName` | 升华职业名 |
| `mainSocketGroup` | 当前主技能组索引 |
| `bandit` | 强盗选择（None / Alira / Kraityn / Oak） |
| `pantheonMajorGod` / `pantheonMinorGod` | 万神殿选择 |

### Gem 元素属性

| 属性 | 说明 |
|------|------|
| `skillId` | 技能 ID，对应 `src/Data/Skills/` |
| `level` | 宝石等级（1-21） |
| `quality` | 宝石品质（0-23） |
| `enabled` | 是否启用 |
| `variantId` | 觉醒/变体宝石的变体 ID |
| `qualityId` | 替代品质类型（Anomalous/Divergent/Phantasmal） |

## 解码实现参考

以下是在 Node.js/Go 中解码 Build 字符串的逻辑：

```javascript
// Node.js / Bun
const zlib = require('zlib')

function decodePobString(code) {
  // 还原标准 base64
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const compressed = Buffer.from(base64, 'base64')
  // zlib inflate（deflate 压缩格式）
  const xml = zlib.inflateSync(compressed)
  return xml.toString('utf8')
}
```

```go
// Go
import (
    "compress/zlib"
    "encoding/base64"
    "strings"
)

func decodePobString(code string) (string, error) {
    // 还原标准 base64
    code = strings.ReplaceAll(code, "-", "+")
    code = strings.ReplaceAll(code, "_", "/")

    compressed, err := base64.StdEncoding.DecodeString(code)
    if err != nil { return "", err }

    r, err := zlib.NewReader(bytes.NewReader(compressed))
    if err != nil { return "", err }
    defer r.Close()

    data, err := io.ReadAll(r)
    return string(data), err
}
```

## 注意事项

1. **目标版本兼容**：`targetVersion` 不是当前游戏版本，而是 build 被保存时的版本。加载时若版本不匹配会触发 build 升级流程（`OpenConversionPopup`）。

2. **PlayerStat 不参与计算**：`<Build>` 内的 `<PlayerStat>` 元素仅是上次计算的缓存值，Web 端可忽略，以计算引擎的输出为准。

3. **importLink**：如果 `<Import importLink="..."/>` 存在，POB 会尝试从该 URL 重新拉取最新 build 数据，Web 端实现时可酌情支持。

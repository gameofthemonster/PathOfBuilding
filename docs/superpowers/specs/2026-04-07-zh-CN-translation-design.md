# PathOfBuilding 中文翻译系统设计文档

**日期：** 2026-04-07
**分支：** `trans`
**翻译数据源：** [PoeCharm2/Data/Translate/zh-rCN](https://github.com/Chuanhsing/PoeCharm2/tree/main/Data/Translate/zh-rCN)

---

## 目标

为 PathOfBuilding 实现中文（简体）翻译支持，让用户可在 Options 中切换语言。要求：
- 最小化对现有文件的改动（以利于 PR 合并）
- 翻译覆盖全部 64 个 CSV 文件对应的 UI 字符串
- 无翻译时 fallback 到英文原文

---

## 1. Git Submodule（新文件）

### 操作

```bash
git submodule add https://github.com/Chuanhsing/PoeCharm2 trs/zh-CN
cd trs/zh-CN
git sparse-checkout init --cone
git sparse-checkout set Data/Translate/zh-rCN
```

### 结果

- 新增：`.gitmodules`（新文件）
- 新增：`trs/zh-CN/`（submodule，仅检出 `Data/Translate/zh-rCN` 目录）
- CSV 文件路径：`trs/zh-CN/Data/Translate/zh-rCN/<ModuleName>.csv`

### CSV 格式

每个 CSV 文件为两列，无表头：
```
English string,中文翻译
```

---

## 2. 翻译模块（新文件）

### 文件：`src/Modules/Translation.lua`

**职责：**
- 加载所有 CSV 文件，构建查找表
- 提供 `Translation.get(str)` 函数
- 提供 `Translation.patch(t)` 函数，递归扫描 table

**接口：**

```lua
-- 全局单例，由 Main.lua 在启动时加载
Translation = {
    lang = "en",       -- 当前语言代码，"en" 或 "zh-CN"
    table = {},        -- ["英文"] = "中文"
}

-- 查找翻译，找不到返回原字符串
function Translation.get(str) end

-- 递归遍历 table，替换 label/description/hint/tooltip 字段
function Translation.patch(t) end

-- 加载指定语言的所有 CSV 文件
function Translation.load(lang) end
```

**CSV 加载路径：**
- 运行时：`trs/zh-CN/Data/Translate/zh-rCN/`（相对于 PoB 工作目录）
- 开发模式：同路径（从仓库根目录运行）

**patch() 扫描规则：**
- 递归遍历 table 中所有 string 类型的字段
- 替换键名为 `label`、`description`、`hint`、`tooltip`、`tooltipText` 的值
- 跳过 `slotName`、`theme`、`protocol`、`scheme` 等非显示字段（维护黑名单）
- 跳过以 `^` 开头（颜色标记）的字符串前缀处理：翻译后保留颜色前缀

**CSV 解析：**
- 支持带引号的字段（处理含逗号的字符串）
- 采用简单状态机逐字符解析，不依赖外部库

---

## 3. 改动 Main.lua（最小改动）

### 3a. 启动时加载翻译（Main.lua 顶部 LoadModule 块附近）

```lua
-- 在现有 LoadModule 调用之后添加
Translation = LoadModule("Modules/Translation")
Translation.load(main.language or "en")
```

### 3b. LoadSettings 中读取语言设置

在 `node.elem == "Misc"` 分支添加：
```lua
if node.attrib.language then
    self.language = node.attrib.language
end
```

### 3c. SaveSettings 中保存语言设置

在 `Misc` attrib table 添加一行：
```lua
language = self.language,
```

### 3d. OpenOptionsPopup 中添加语言下拉

在 "Application options" section 末尾（`drawSectionHeader("app", ...)` 之后）添加语言选择控件：

```lua
nextRow()
controls.language = new("DropDownControl", {...}, {
    { label = "English", lang = "en" },
    { label = "Simplified Chinese", lang = "zh-CN" },
}, function(index, value)
    self.language = value.lang
end)
controls.languageLabel = new("LabelControl", {...}, "^7Language:")
controls.language.tooltipText = "Changes the display language. Requires restart to take effect."
controls.language:SelByValue(self.language or "en", "lang")
```

**语言切换：** 重启后生效（不做即时刷新，保持实现简单）。

---

## 4. 翻译触发时机

**不修改各 Tab/Class 文件**。

由于大多数字符串表（如 `groupSlotDropList`）是各模块文件的 `local` 变量，无法从外部直接访问。因此采用 **monkey-patch `new()` 全局函数** 的方式统一拦截。

PoB 的所有控件创建均通过全局 `new(className, ...)` 函数完成（例如 `new("DropDownControl", anchor, pos, list, func)`）。Translation.lua 加载后立即替换此函数：

```lua
local _orig_new = new
new = function(className, ...)
    local args = {...}
    for i, arg in ipairs(args) do
        if type(arg) == "table" then
            Translation.patch(arg)  -- 递归翻译 label/description 等字段
        elseif type(arg) == "string" then
            args[i] = Translation.get(arg)  -- 直接翻译字符串参数
        end
    end
    return _orig_new(className, unpack(args))
end
```

**覆盖范围：**
- 所有通过 `new()` 创建的控件的字符串参数（LabelControl 文字、ButtonControl 标签等）
- 所有传给控件的 list table（DropDownControl 的选项列表、label/description 字段）
- tooltipText 等在 `new()` 调用后设置的字段：由 `patch()` 在赋值后处理（通过 `__newindex` 元方法或在 Translation.load() 完成后对已有全局表做一次性扫描）

---

## 5. 覆盖范围分析

| 类型 | 覆盖情况 |
|---|---|
| 下拉菜单 label | ✅ 通过 patch() |
| 按钮文字 | ✅ 通过 patch() |
| tooltipText | ✅ 通过 patch() |
| description 字段 | ✅ 通过 patch() |
| 动态拼接字符串 | ❌ 不覆盖（暂时） |
| 游戏数据（mod 词缀等） | ❌ 不覆盖（非 UI） |

---

## 6. 文件改动汇总

| 文件 | 类型 | 说明 |
|---|---|---|
| `.gitmodules` | 新增 | submodule 配置 |
| `trs/zh-CN/` | 新增 | PoeCharm2 submodule |
| `src/Modules/Translation.lua` | 新增 | 翻译核心模块 |
| `src/Modules/Main.lua` | 修改 | 4 处小改动（加载/读取/保存/UI） |

**不改动任何其他 Lua 文件**（Tab、Class、其他 Module）。

---

## 7. 约束与假设

- PoB 工作目录相对路径：`trs/zh-CN/` 相对于 `manifest.xml` 所在目录
- CSV 文件编码：UTF-8
- Lua 字符串比较大小写敏感，CSV key 必须与代码中字符串完全匹配
- 语言切换重启后生效（不支持热切换）

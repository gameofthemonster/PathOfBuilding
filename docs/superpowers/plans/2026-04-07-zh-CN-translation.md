# zh-CN Translation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chinese (Simplified) UI translation to PathOfBuilding, switchable via Options, with zero modifications to Tab/Class files.

**Architecture:** git submodule provides PoeCharm2 CSV data at `trs/zh-CN/Data/Translate/zh-rCN/`; a new `Translation.lua` loads CSVs, builds a lookup table, and monkey-patches the global `new()` to auto-translate control arguments at creation time; four minimal edits to `Main.lua` wire up load → persist → UI.

**Tech Stack:** Lua 5.1/LuaJIT, standard `io` library, git submodule with sparse-checkout

---

### Task 1: Add git submodule

**Files:**
- Create: `.gitmodules`
- Create: `trs/zh-CN/` (submodule)

- [ ] **Step 1: Add PoeCharm2 as submodule**

```bash
git submodule add https://github.com/Chuanhsing/PoeCharm2 trs/zh-CN
```

Expected: clones PoeCharm2 to `trs/zh-CN/`, creates/updates `.gitmodules`

- [ ] **Step 2: Configure sparse-checkout (only zh-rCN translation files)**

```bash
cd trs/zh-CN
git sparse-checkout init --cone
git sparse-checkout set Data/Translate/zh-rCN
cd ../..
```

Expected: only `trs/zh-CN/Data/Translate/zh-rCN/` directory is present (64 CSV files)

- [ ] **Step 3: Verify CSV files are accessible**

```bash
ls trs/zh-CN/Data/Translate/zh-rCN/ | wc -l
```

Expected output: `64` (or close to it)

- [ ] **Step 4: Commit submodule**

```bash
git add .gitmodules trs/
git commit -m "feat: add PoeCharm2 as translation submodule (sparse: zh-rCN only)"
```

---

### Task 2: Create `src/Modules/Translation.lua`

**Files:**
- Create: `src/Modules/Translation.lua`

- [ ] **Step 1: Create the file**

Create `src/Modules/Translation.lua` with exact content:

```lua
-- Path of Building
-- Module: Translation
-- Provides Chinese (Simplified) translation support via CSV lookup.
-- Wraps global new() to auto-translate control arguments when lang != "en".

Translation = {
	lang = "en",
	table = {},
}

-- Field keys whose string values should be translated
local TRANSLATE_KEYS = {
	label = true, description = true, hint = true,
	tooltip = true, tooltipText = true,
}

-- Translate a string, preserving leading color codes (e.g. "^7text" -> "^7中文")
local function translateStr(s)
	if type(s) ~= "string" or s == "" then return s end
	-- Match ^xRRGGBB prefix (6 hex digits)
	local prefix, text = s:match("^(%^x%x%x%x%x%x%x)(.*)")
	if not prefix then
		-- Match single-char color code like ^7, ^1, ^8
		prefix, text = s:match("^(%^.)(.*)")
	end
	if prefix and text then
		local tr = Translation.table[text]
		return tr and (prefix .. tr) or s
	end
	return Translation.table[s] or s
end

-- Recursively patch a table: translate values at TRANSLATE_KEYS, recurse into sub-tables
function Translation.patch(t)
	if type(t) ~= "table" then return end
	for k, v in pairs(t) do
		if TRANSLATE_KEYS[k] and type(v) == "string" then
			t[k] = translateStr(v)
		elseif type(v) == "table" and not TRANSLATE_KEYS[k] then
			Translation.patch(v)
		end
	end
end

-- Translate a single string (used for direct string args passed to new())
function Translation.get(s)
	return translateStr(s)
end

-- Parse one CSV line per RFC 4180 (handles double-quoted fields containing commas/newlines)
local function parseCSVLine(line)
	local fields, i, len = {}, 1, #line
	while i <= len do
		if line:sub(i, i) == '"' then
			local field, j = "", i + 1
			while j <= len do
				local c = line:sub(j, j)
				if c == '"' then
					if line:sub(j + 1, j + 1) == '"' then
						field = field .. '"'
						j = j + 2
					else
						j = j + 1
						break
					end
				else
					field = field .. c
					j = j + 1
				end
			end
			fields[#fields + 1] = field
			i = j
			if line:sub(i, i) == "," then i = i + 1 end
		else
			local j = line:find(",", i, true)
			if j then
				fields[#fields + 1] = line:sub(i, j - 1)
				i = j + 1
			else
				fields[#fields + 1] = line:sub(i)
				break
			end
		end
	end
	return fields
end

-- All 64 CSV files in zh-rCN (sourced from PoeCharm2)
local CSV_FILES = {
	"Build.csv", "BuildDisplayStats.csv", "BuildListControl.csv",
	"CalcBreakdown.csv", "CalcDefence.csv", "CalcOffence.csv",
	"CalcSections.csv", "CalcSetup.csv", "CalcsTab.csv",
	"ConfigOptions.csv", "ConfigTab.csv",
	"Data.csv", "ExtBuildListControl.csv",
	"Flask_tag.csv", "Gems_data.csv", "Gems_data.txt.csv", "Gems_tag.csv",
	"GUI.csv", "ImportTab.csv",
	"ItemDBControl.csv", "ItemListControl.csv", "ItemSetListControl.csv", "ItemsTab.csv",
	"Items_Accessories.txt.csv", "Items_Armour.txt.csv", "Items_Flasks.txt.csv",
	"Items_Gems.csv", "Items_Gems.txt.csv", "Items_Jewels.txt.csv",
	"Items_Minions.csv", "Items_Oils.csv", "Items_Weapons.txt.csv",
	"Main.csv", "MinionListControl.csv", "Minions_tag.csv",
	"ModMap.csv", "Monsters.csv",
	"NotesTab.csv",
	"PartyTab.csv", "PassiveTreeView.csv",
	"PoBArchivesProvider.csv", "PowerReportListControl.csv",
	"Query_Mod.csv",
	"SharedItemListControl.csv", "SharedItemSetListControl.csv",
	"SkillsTab.csv", "statDescriptions.csv",
	"stats_words_prefix.csv", "stats_words_suffix.csv",
	"TattooPassives.csv", "Tatto.csv", "TimelessJewelListControl.csv",
	"TradeQuery.csv", "Tree.csv", "TreeTab.csv",
	"Uniques.txt.csv", "Unsorted.csv", "Z.csv",
	"passiveTree.csv", "tree_dn.csv", "tree_rt.csv", "tree_sd.csv",
}

-- Load all CSV files for the given language into Translation.table.
-- Call this after reading language from Settings.xml.
function Translation.load(lang)
	Translation.lang = lang or "en"
	Translation.table = {}
	if Translation.lang == "en" then return end

	local basePath = "trs/zh-CN/Data/Translate/zh-rCN/"
	local loaded, skipped = 0, 0

	for _, filename in ipairs(CSV_FILES) do
		local f = io.open(basePath .. filename, "r")
		if f then
			local content = f:read("*a")
			f:close()
			-- Strip UTF-8 BOM if present
			if content:sub(1, 3) == "\xEF\xBB\xBF" then
				content = content:sub(4)
			end
			-- Parse line by line (normalise \r\n -> \n)
			for line in (content .. "\n"):gmatch("([^\r\n]*)\r?\n") do
				if line ~= "" then
					local fields = parseCSVLine(line)
					local key, val = fields[1], fields[2]
					if key and key ~= "" and val then
						Translation.table[key] = val
					end
				end
			end
			loaded = loaded + 1
		else
			skipped = skipped + 1
		end
	end

	if skipped > 0 then
		ConPrintf("Translation: loaded %d CSV files, %d not found (run: git submodule update --init trs/zh-CN)", loaded, skipped)
	end
end

-- Wrap the global new() to auto-translate string/table args when a non-English lang is active.
-- This is installed once at module load time; overhead when lang=="en" is a single comparison.
local _orig_new = new
new = function(className, ...)
	if Translation.lang == "en" then
		return _orig_new(className, ...)
	end
	local args = { ... }
	for i = 1, #args do
		local arg = args[i]
		if type(arg) == "string" then
			args[i] = Translation.get(arg)
		elseif type(arg) == "table" then
			Translation.patch(arg)
		end
	end
	return _orig_new(className, unpack(args))
end

return Translation
```

- [ ] **Step 2: Syntax-check the new file**

```bash
luajit -e "loadfile('src/Modules/Translation.lua')()" 2>&1 | head -5
```

Expected: no output (loads cleanly; `new` is not defined in isolation so a NameError is OK here — we just want no parse errors). If you see a parse error line number, fix it before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/Modules/Translation.lua
git commit -m "feat: add Translation module with CSV loader and new() monkey-patch"
```

---

### Task 3: Modify `src/Modules/Main.lua` (4 targeted edits)

**Files:**
- Modify: `src/Modules/Main.lua`

#### Edit 3a — Load Translation after ToastNotification (line ~27)

- [ ] **Step 1: Add one line after ToastNotification load**

Find this exact block in `src/Modules/Main.lua`:
```lua
-- Load as global so other modules can access the same instance
ToastNotification = LoadModule("Modules/ToastNotification")
```

Replace with:
```lua
-- Load as global so other modules can access the same instance
ToastNotification = LoadModule("Modules/ToastNotification")
Translation = LoadModule("Modules/Translation")
```

---

#### Edit 3b — Read language from Settings.xml (in `LoadSettings`, line ~628–632)

- [ ] **Step 2: Add language read in the Misc attrib block**

Find this exact block near the end of the `node.elem == "Misc"` branch:
```lua
			if node.attrib.dpiScaleOverridePercent then
				self.dpiScaleOverridePercent = tonumber(node.attrib.dpiScaleOverridePercent) or 0
				SetDPIScaleOverridePercent(self.dpiScaleOverridePercent)
			end
		end
	end
end
```

Replace with:
```lua
			if node.attrib.dpiScaleOverridePercent then
				self.dpiScaleOverridePercent = tonumber(node.attrib.dpiScaleOverridePercent) or 0
				SetDPIScaleOverridePercent(self.dpiScaleOverridePercent)
			end
			if node.attrib.language then
				self.language = node.attrib.language
				Translation.load(self.language)
			end
		end
	end
end
```

---

#### Edit 3c — Save language to Settings.xml (in `SaveSettings`, line ~763)

- [ ] **Step 3: Add language field to Misc attrib**

Find this exact block in `SaveSettings()`:
```lua
		dpiScaleOverridePercent = tostring(self.dpiScaleOverridePercent),
	} })
```

Replace with:
```lua
		dpiScaleOverridePercent = tostring(self.dpiScaleOverridePercent),
		language = self.language,
	} })
```

---

#### Edit 3d — Add Language dropdown to OpenOptionsPopup (line ~842)

- [ ] **Step 4: Insert language selector at top of Application options section**

Find this exact block in `OpenOptionsPopup()`:
```lua
	drawSectionHeader("app", "Application options")

	controls.connectionProtocol = new("DropDownControl", { "TOPLEFT", nil, "TOPLEFT" }, { defaultLabelPlacementX, currentY, 100, 18 }, {
```

Replace with:
```lua
	drawSectionHeader("app", "Application options")

	controls.language = new("DropDownControl", { "TOPLEFT", nil, "TOPLEFT" }, { defaultLabelPlacementX, currentY, 150, 18 }, {
		{ label = "English", lang = "en" },
		{ label = "Simplified Chinese", lang = "zh-CN" },
	}, function(index, value)
		self.language = value.lang
	end)
	controls.languageLabel = new("LabelControl", { "RIGHT", controls.language, "LEFT" }, { defaultLabelSpacingPx, 0, 0, 16 }, "^7Language:")
	controls.language.tooltipText = "Changes the display language. Restart to apply."
	controls.language:SelByValue(self.language or "en", "lang")

	nextRow()
	controls.connectionProtocol = new("DropDownControl", { "TOPLEFT", nil, "TOPLEFT" }, { defaultLabelPlacementX, currentY, 100, 18 }, {
```

- [ ] **Step 5: Commit all Main.lua changes**

```bash
git add src/Modules/Main.lua
git commit -m "feat: wire Translation into Main.lua (load/persist/Options UI)"
```

---

### Task 4: Final check

- [ ] **Step 1: Verify file structure**

```bash
git log --oneline -4
```

Expected (newest first):
```
xxxxxxx feat: wire Translation into Main.lua (load/persist/Options UI)
xxxxxxx feat: add Translation module with CSV loader and new() monkey-patch
xxxxxxx feat: add PoeCharm2 as translation submodule (sparse: zh-rCN only)
xxxxxxx Add zh-CN translation system design spec
```

- [ ] **Step 2: Verify only expected files were modified**

```bash
git diff HEAD~3 --name-only
```

Expected:
```
.gitmodules
src/Modules/Main.lua
src/Modules/Translation.lua
trs/zh-CN
```

- [ ] **Step 3: Check Main.lua syntax**

```bash
luajit -e "
  -- stub missing globals so we can parse
  new=function() end
  LoadModule=function() end
  ConPrintf=function() end
  loadfile('src/Modules/Main.lua')
" 2>&1 | head -10
```

Expected: no parse errors (runtime errors about missing functions are OK)

- [ ] **Step 4: Manual smoke test checklist (run PoB)**

```
1. Launch PoB → confirm it starts without error
2. Click Options (bottom-left)
3. Confirm "Language / 语言:" dropdown appears at top of Application options
4. Select "Simplified Chinese" → close Options (saves settings)
5. Restart PoB
6. Open Skills tab → confirm slot list shows "无" instead of "None"
7. Open Options → confirm "Language / 语言:" dropdown still shows "Simplified Chinese"
8. Switch back to English → restart → confirm English UI restored
```

- [ ] **Step 5: Done — push branch**

```bash
git push origin trans
```

-- Path of Building
-- Module: Translation
-- Generic translation support via CSV lookup tables.
-- Supports any language by placing CSV files under trs/<lang>/.
-- Wraps global new() to auto-translate UI control labels when lang != "en".

Translation = {
	lang = "en",
	table = {},
}

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Normalise a path: forward slashes, strip Windows \\?\ extended prefix,
-- ensure a single trailing slash.
local function cleanPath(path)
	if not path or path == "" then return nil end
	path = path:gsub("\\", "/")          -- backslash -> slash
	path = path:gsub("^//%?/", "")       -- strip //?/ (\\?\)
	path = path:gsub("/?$", "/")         -- ensure trailing slash
	return path
end

-- Translate a string, preserving surrounding color codes.
-- Handles patterns such as:
--   "^7Average Hit^7:"        leading ^7, core "Average Hit", trailing "^7:"
--   "^xE05030Foo Bar^7:"      leading ^xRRGGBB, core "Foo Bar", trailing "^7:"
--   "Average Hit:"            no leading color code, lookup as-is
-- Strategy:
--   1. Strip leading color code(s) → prefix + rest
--   2. Direct lookup of rest
--   3. Try stripping a single trailing color-code sequence from rest
--      → look up (core + non-color trailing punctuation like ":")
--   4. Fallback: return s unchanged
local function translateStr(s)
	if type(s) ~= "string" or s == "" then return s end

	-- Strip leading color code (^xRRGGBB or ^X single char)
	local prefix, rest
	prefix, rest = s:match("^(%^x%x%x%x%x%x%x)(.*)")   -- ^xRRGGBB
	if not prefix then
		prefix, rest = s:match("^(%^.)(.*)")             -- ^7 etc.
	end
	if not prefix then
		prefix, rest = "", s
	end

	-- 1. Direct lookup of rest (after leading color code stripped)
	local tr = Translation.table[rest]
	if tr then return prefix .. tr end

	-- 2. Try to decompose trailing "^colorcode + punctuation" pattern
	--    e.g. rest = "Average Hit^7:" → trailingColor="^7", trailingPunct=":"
	local core, trailingColor, trailingPunct =
		rest:match("^(.-)(%^x%x%x%x%x%x%x)([^%^]*)$")   -- trailing ^xRRGGBB + optional chars
	if not core then
		core, trailingColor, trailingPunct =
			rest:match("^(.-)(%^.)([^%^]*)$")             -- trailing ^7 + optional chars
	end
	if core and core ~= "" then
		-- Try lookup with trailing punctuation appended (e.g. "Average Hit:")
		local keyWithPunct = core .. (trailingPunct or "")
		tr = Translation.table[keyWithPunct]
		if tr then return prefix .. tr .. trailingColor end
		-- Try lookup without trailing punctuation (e.g. "Average Hit")
		tr = Translation.table[core]
		if tr then return prefix .. tr .. trailingColor .. (trailingPunct or "") end
	end

	-- 3. Try appending ":" to find a colon-keyed entry, then strip the colon from the result.
	--    Handles cases where the CSV key has a colon (e.g. "Average Hit:") but the caller
	--    passes the bare label (e.g. statData.label = "Average Hit").
	tr = Translation.table[rest .. ":"]
	if tr then return prefix .. tr:gsub(":$", "") end

	-- 4. Placeholder fallback: replace numbers in `rest` with {0}, {1}, ... and look up
	--    the resulting template key (matches statDescriptions.csv entries like
	--    "{0}% increased Evasion Rating while you have an active Tincture").
	--    If found, substitute the captured numbers back into the translated template.
	--    Also handles "+N ..." patterns where statDescriptions.csv stores "{0} ..."
	--    (the + sign appears before the number in tree stat strings but not in CSV keys).
	do
		local nums = {}
		local idx = 0
		local templated = rest:gsub("%-?%d+%.?%d*", function(n)
			nums[idx] = n
			local ph = "{"..idx.."}"
			idx = idx + 1
			return ph
		end)
		if idx > 0 then
			-- Helper: look up a template and substitute numbers back.
			local function resolveTemplate(tmpl)
				local t = Translation.table[tmpl]
				if not t then
					-- Also try colon-keyed variant
					t = Translation.table[tmpl .. ":"]
					if t then t = t:gsub(":$", "") end
				end
				if t then
					return t:gsub("{(%d+)}", function(i)
						return nums[tonumber(i)] or ("{" .. i .. "}")
					end)
				end
			end
			-- Try the template as-is first
			local result = resolveTemplate(templated)
			if result then return prefix .. result end
			-- Try stripping "+" signs that appear directly before a placeholder {N}.
			-- Handles "+20 to maximum Life" → template "+{0} to maximum Life"
			-- which should match CSV key "{0} to maximum Life".
			-- Track which placeholder indices had a "+" so we can restore it in the result.
			local hasPlus = {}
			local stripped = templated:gsub("%+({(%d+)})", function(ph, i)
				-- ph = "{N}", i = "N" (the captured digit string)
				hasPlus[tonumber(i)] = true
				return ph   -- keep the placeholder, just drop the preceding "+" from the match
			end)
			if stripped ~= templated then
				local t = Translation.table[stripped]
				if not t then
					t = Translation.table[stripped .. ":"]
					if t then t = t:gsub(":$", "") end
				end
				if t then
					local result2 = t:gsub("{(%d+)}", function(i)
						local n = nums[tonumber(i)] or ("{" .. i .. "}")
						if hasPlus[tonumber(i)] and not tostring(n):match("^%-") then
							return "+" .. n
						end
						return n
					end)
					return prefix .. result2
				end
			end
		end
	end

	-- 5. Full string lookup (no leading color code was found)
	tr = Translation.table[s]
	if tr then return tr end

	return s
end

-- ---------------------------------------------------------------------------
-- Public API
-- ---------------------------------------------------------------------------

-- Translate a single string.
function Translation.get(s)
	return translateStr(s)
end

-- Field keys whose string values should be translated when patching a table.
local TRANSLATE_KEYS = {
	label = true, description = true, hint = true,
	tooltip = true, tooltipText = true,
}

-- Recursively translate TRANSLATE_KEYS values in a table.
function Translation.patch(t, _seen, _depth)
	if type(t) ~= "table" then return end
	_seen  = _seen  or {}
	_depth = _depth or 0
	if _depth > 4 or _seen[t] then return end
	_seen[t] = true
	for k, v in pairs(t) do
		if TRANSLATE_KEYS[k] and type(v) == "string" then
			t[k] = translateStr(v)
		elseif type(v) == "table" and not TRANSLATE_KEYS[k] then
			Translation.patch(v, _seen, _depth + 1)
		end
	end
end

-- ---------------------------------------------------------------------------
-- CSV loader
-- ---------------------------------------------------------------------------

local function parseCSVLine(line)
	local fields, i, len = {}, 1, #line
	while i <= len do
		if line:sub(i, i) == '"' then
			local field, j = "", i + 1
			while j <= len do
				local c = line:sub(j, j)
				if c == '"' then
					if line:sub(j + 1, j + 1) == '"' then
						field = field .. '"'; j = j + 2
					else
						j = j + 1; break
					end
				else
					field = field .. c; j = j + 1
				end
			end
			fields[#fields + 1] = field
			i = j
			if line:sub(i, i) == "," then i = i + 1 end
		else
			local j = line:find(",", i, true)
			if j then
				fields[#fields + 1] = line:sub(i, j - 1); i = j + 1
			else
				fields[#fields + 1] = line:sub(i); break
			end
		end
	end
	return fields
end

-- Load a single CSV file into Translation.table.
-- Returns number of entries loaded.
local function loadCSVFile(path)
	local f = io.open(path, "r")
	if not f then return 0 end
	local content = f:read("*a")
	f:close()
	if content:sub(1, 3) == "\xEF\xBB\xBF" then
		content = content:sub(4)
	end
	local entries = 0
	for line in (content .. "\n"):gmatch("([^\r\n]*)\r?\n") do
		if line ~= "" then
			local row = parseCSVLine(line)
			local key, val = row[1], row[2]
			if key and key ~= "" and val then
				Translation.table[key] = val
				entries = entries + 1
			end
		end
	end
	return entries
end

-- Load every *.csv in dirPath into Translation.table with priority ordering:
--   1. All other CSVs (alphabetical, lowest priority)
--   2. Main.csv  (overrides others)
--   3. GUI.csv   (highest priority, overrides everything)
-- Returns number of files and entries loaded.
local function loadCSVDir(dirPath)
	-- First pass: collect all filenames
	local allFiles = {}
	local handle = NewFileSearch(dirPath .. "*.csv")
	while handle do
		allFiles[#allFiles + 1] = handle:GetFileName()
		if not handle:NextFile() then break end
	end

	-- Priority filenames (case-insensitive match)
	local PRIORITY = { ["main.csv"] = 1, ["gui.csv"] = 2 }

	-- Sort: normal files first (alphabetically), then Main.csv, then GUI.csv
	table.sort(allFiles, function(a, b)
		local pa = PRIORITY[a:lower()] or 0
		local pb = PRIORITY[b:lower()] or 0
		if pa ~= pb then return pa < pb end
		return a:lower() < b:lower()
	end)

	local files, entries = 0, 0
	for _, filename in ipairs(allFiles) do
		local n = loadCSVFile(dirPath .. filename)
		files = files + 1
		entries = entries + n
	end
	return files, entries
end

-- ---------------------------------------------------------------------------
-- Translation.load
-- ---------------------------------------------------------------------------

-- Load translations for the given language code.
-- CSV files are expected under  trs/<lang>/  next to the src/ directory.
-- Called from Main.lua before any UI modules are loaded.
function Translation.load(lang)
	lang = lang or "en"
	-- Skip reload if language hasn't changed and table is already populated
	if lang == Translation.lang and next(Translation.table) ~= nil then return end
	Translation.lang  = lang
	Translation.table = {}
	if Translation.lang == "en" then return end

	-- Derive repo root from GetScriptPath() (which points at src/).
	local scriptPath = cleanPath(GetScriptPath and GetScriptPath() or "")
	local repoRoot   = (scriptPath and scriptPath:match("^(.*/)src/$")) or scriptPath or ""
	local basePath   = repoRoot .. "trs/" .. Translation.lang .. "/"

	local files, entries = loadCSVDir(basePath)
	if files == 0 then
		ConPrintf("Translation: no CSV files found at %s", basePath)
	else
		ConPrintf("Translation: loaded %d files, %d entries from %s", files, entries, basePath)
	end

	-- Wrap DrawString with a translation cache so each unique string is only
	-- translated once regardless of how many frames it is drawn.
	-- Cache layout:  _drawCache[original] = translated   (on hit)
	--                _drawCache[original] = false         (on miss, skip retrying)
	-- The cache is rebuilt whenever Translation.load() is called.
	Translation._drawCache = {}
	if not Translation._drawStringWrapped then
		Translation._drawStringWrapped = true
		local _orig_DrawString = DrawString
		DrawString = function(x, y, align, size, font, text)
			if Translation.lang ~= "en" and type(text) == "string" then
				local cached = Translation._drawCache[text]
				if cached == nil then
					local result = translateStr(text)
					if result ~= text then
						-- Successful translation: cache the result
						Translation._drawCache[text] = result
						text = result
					else
						-- No translation found: cache as false to skip future lookups
						Translation._drawCache[text] = false
					end
				elseif cached ~= false then
					text = cached
				end
			end
			return _orig_DrawString(x, y, align, size, font, text)
		end
	end
end

-- ---------------------------------------------------------------------------
-- new() / newClass() wrappers
-- ---------------------------------------------------------------------------

-- UI control classes whose 3rd constructor argument is a display label.
local LABEL_ARG_CLASSES = {
	ButtonControl   = true,
	CheckBoxControl = true,
	DraggerControl  = true,
	LabelControl    = true,
	SectionControl  = true,
}

-- Wrap new() to translate the label string argument of known UI control classes.
-- Table arguments are NOT recursively patched here — patch() is only called
-- explicitly where needed (e.g. DropDown list items) to avoid O(N) cost on
-- every new() call during startup (Item DB loads tens of thousands of objects).
local _orig_new = new
new = function(className, ...)
	if Translation.lang == "en" then
		return _orig_new(className, ...)
	end
	if LABEL_ARG_CLASSES[className] then
		local argc = select("#", ...)
		local args = {}
		for i = 1, argc do args[i] = select(i, ...) end
		-- label is always the 3rd argument (after anchor, rect)
		if type(args[3]) == "string" then
			args[3] = translateStr(args[3])
		end
		return _orig_new(className, unpack(args, 1, argc))
	end
	-- On first Tooltip construction, patch AddLine lazily (TooltipClass:AddLine
	-- is not defined until after newClass("Tooltip",...) returns, so we cannot
	-- wrap it at newClass time).
	if className == "Tooltip" then
		patchTooltipAddLine()
	end
	if className == "EditControl" then
		patchEditControlSetPlaceholder()
	end
	if className == "ItemListControl" then
		patchItemListGetRowValue()
	end
	return _orig_new(className, ...)
end

-- UI control classes that may set obj.label / obj.placeholder after construction.
local LABEL_CLASSES = {
	ButtonControl   = true,
	CheckBoxControl = true,
	DraggerControl  = true,
	LabelControl    = true,
	SectionControl  = true,
	SliderControl   = true,
	EditControl     = true,
	DropDownControl = true,
}

-- Wrap newClass() to install __newindex on label-bearing control classes so
-- that post-construction  obj.label = "..."  assignments are also translated.
local _orig_newClass = newClass
newClass = function(className, ...)
	local class = _orig_newClass(className, ...)
	if LABEL_CLASSES[className] then
		-- Instances are created as setmetatable({}, class), so Lua looks up
		-- __newindex in `class` itself.  We set it directly so every new key
		-- assignment on any instance passes through the translator.
		class.__newindex = function(t, k, v)
			if Translation.lang ~= "en" and (k == "label" or k == "placeholder") and type(v) == "string" then
				v = translateStr(v)
			end
			rawset(t, k, v)
		end
	end
	return class
end

-- Install Tooltip.AddLine patch the first time new("Tooltip") is called,
-- by which point TooltipClass:AddLine() is guaranteed to be defined.
function patchTooltipAddLine()
	if Translation._tooltipAddLinePatched then return end
	Translation._tooltipAddLinePatched = true
	local tooltipClass = common and common.classes and common.classes["Tooltip"]
	if tooltipClass and tooltipClass.AddLine then
		local _orig_AddLine = tooltipClass.AddLine
		tooltipClass.AddLine = function(self, size, text, font)
			if type(text) == "string" then
				text = translateStr(text)
			end
			return _orig_AddLine(self, size, text, font)
		end
	end
end

-- EditControl.SetPlaceholder uses the same deferred-patch pattern.
function patchEditControlSetPlaceholder()
	if Translation._editPlaceholderPatched then return end
	Translation._editPlaceholderPatched = true
	local editClass = common and common.classes and common.classes["EditControl"]
	if editClass and editClass.SetPlaceholder then
		local _orig_SetPlaceholder = editClass.SetPlaceholder
		editClass.SetPlaceholder = function(self, text, notify)
			if type(text) == "string" then
				text = translateStr(text)
			end
			return _orig_SetPlaceholder(self, text, notify)
		end
	end
end

-- ItemListControl.GetRowValue builds "title, baseName" by concatenation,
-- so the combined string can't be looked up as a whole.  Patch it to translate
-- each part separately before joining.
function patchItemListGetRowValue()
	if Translation._itemListGetRowValuePatched then return end
	Translation._itemListGetRowValuePatched = true
	local cls = common and common.classes and common.classes["ItemListControl"]
	if cls and cls.GetRowValue then
		local _orig = cls.GetRowValue
		cls.GetRowValue = function(self, column, index, itemId)
			local result = _orig(self, column, index, itemId)
			if column == 1 and type(result) == "string" then
				local item = self.itemsTab and self.itemsTab.items and self.itemsTab.items[itemId]
				if item then
					if item.title and item.baseName then
						local tTitle   = translateStr(item.title)
						local tBase    = translateStr(item.baseName:gsub(" %(.+%)",""))
						result = result:gsub(item.title .. ", " .. item.baseName:gsub(" %(.+%)",""), tTitle .. ", " .. tBase, 1)
					elseif item.name then
						local tName = translateStr(item.name)
						result = result:gsub(item.name, tName, 1)
					end
				end
			end
			return result
		end
	end
end

return Translation

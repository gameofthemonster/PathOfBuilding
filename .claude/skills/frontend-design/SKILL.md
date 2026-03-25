---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: Apache 2.0. Based on Anthropic's frontend-design skill, extended by Impeccable (pbakaus). See NOTICE.md for attribution.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Endless Project Design System

**CRITICAL**: This project uses Tailwind CSS with the **Reui Lyra theme**. All styling MUST follow these conventions:

| Convention | Rule |
|-----------|------|
| **Border radius** | **Zero** — use `rounded-none` or omit `rounded` entirely. Never use `rounded`, `rounded-md`, `rounded-lg`, etc. |
| **Primary color** | `indigo-*` (e.g., `indigo-400` for focus rings, `indigo-500/600` for interactive elements) |
| **Base color** | `neutral-*` (e.g., `neutral-200` for borders, `neutral-500` for muted text) |
| **className merging** | Always use `cn()` from `../lib/utils` |
| **UI components** | Import from `web/src/components/ui/` — never use Radix directly with namespace syntax |
| **Tab routing** | Tab switching must reflect to URL params, never `useState` for active tab |

**Available UI components** (all from `web/src/components/ui/`):
- `Button` — variant: primary/secondary/ghost/danger/outline; size: xs/sm/md
- `Input`, `Textarea` — standard indigo-400 focus ring
- `SelectRoot/Trigger/Content/Item`
- `TabsRoot/TabsList/TabsTrigger` (underline) or `TabsPillList/TabsPillTrigger` (pill)
- `DialogRoot/DialogContent` (takes `title`/`description` props), `DialogBody`, `DialogFooter`
- `ConfirmDialog` — one-shot confirm pattern
- `DropdownMenuRoot/Content/MenuItem`

---

## Design Direction

Commit to a clear aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Precise and professional (Endless is a developer/operator-facing platform). Clean, information-dense, no decorative fluff.
- **Constraints**: Tailwind CSS, zero border-radius, indigo + neutral palette.
- **Differentiation**: What makes this component unforgettable in its clarity and usefulness?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision.

---

## Frontend Aesthetics Guidelines

### Typography
→ *Consult [typography reference](reference/typography.md) for scales, pairing, and loading strategies.*

**DO**: Use modular type scale with clear size contrast between hierarchy levels
**DO**: Vary font weights (`font-medium`, `font-semibold`) to create visual hierarchy
**DON'T**: Use Inter or generic system fonts for display headings when distinctiveness matters
**DON'T**: Put rounded icons above every heading — they look templated
**DON'T**: Use `font-mono` as lazy shorthand for "technical/developer" vibes

### Color & Theme
→ *Consult [color-and-contrast reference](reference/color-and-contrast.md) for palettes, dark mode, and accessibility.*

**DO**: Use indigo for all interactive and primary elements (`focus:ring-indigo-100`, `border-indigo-400`)
**DO**: Use neutral-xxx for borders, muted text, backgrounds (tinted, not pure gray)
**DON'T**: Use gray text on colored backgrounds — it looks washed out
**DON'T**: Use pure black (`#000`) or pure white (`#fff`) — always tint
**DON'T**: Use the AI color palette: cyan-on-dark, purple-to-blue gradients, neon accents on dark
**DON'T**: Use gradient text for "impact" on headings or metrics

### Layout & Space
→ *Consult [spatial-design reference](reference/spatial-design.md) for grids, rhythm, and hierarchy.*

**DO**: Create visual rhythm through varied spacing — tight groupings, generous separations
**DO**: Use asymmetry and editorial layouts over centered everything
**DON'T**: Wrap everything in cards — not everything needs a container
**DON'T**: Nest cards inside cards — flatten the hierarchy
**DON'T**: Use identical card grids: icon + heading + text, repeated endlessly
**DON'T**: Center everything — left-aligned with asymmetric layouts feels more designed

### Visual Details
**DO**: Use `border border-neutral-200` for standard component borders
**DO**: Use `focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100` for input groups
**DON'T**: Use glassmorphism (blur cards, glow borders) decoratively
**DON'T**: Use rounded rectangles with drop shadows — safe and forgettable
**DON'T**: Use modals unless truly necessary — modals are lazy

### Motion
→ *Consult [motion-design reference](reference/motion-design.md) for timing and easing.*

**DO**: Use `transition-colors`, `transition-opacity` for state changes
**DO**: Use exponential easing for natural deceleration
**DON'T**: Animate layout properties (width, height, padding)
**DON'T**: Use bounce or elastic easing — dated and tacky

### Interaction
→ *Consult [interaction-design reference](reference/interaction-design.md) for forms, focus, and loading patterns.*

**DO**: Use optimistic UI — update immediately, sync later
**DO**: Design empty states that teach the interface
**DO**: Use `InputGroup` pattern for icon + input combos:
```tsx
<div className="flex border border-neutral-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition-colors">
  <div className="flex items-center px-2.5 text-neutral-400 border-r border-neutral-200 shrink-0">{icon}</div>
  <input className="flex-1 px-3 py-2 outline-none bg-white" />
</div>
```
**DON'T**: Make every button primary — use ghost, secondary, text styles for hierarchy

### Responsive
→ *Consult [responsive-design reference](reference/responsive-design.md) for mobile-first and container queries.*

**DO**: Adapt the interface for different contexts — don't just shrink it
**DON'T**: Hide critical functionality on mobile

### UX Writing
→ *Consult [ux-writing reference](reference/ux-writing.md) for labels, errors, and empty states.*

**DO**: Make every word earn its place
**DON'T**: Repeat information users can already see

---

## The AI Slop Test

**Critical quality check**: If you showed this component to someone and said "AI made this," would they believe you immediately? If yes, that's the problem.

Review the DON'T guidelines above — they are the fingerprints of AI-generated work.

---

## Implementation Principles

- All Tailwind classes must be literal strings (no dynamic construction beyond `cn()`)
- Use `cn()` for all conditional className merging
- Match implementation complexity to design vision
- Interpret creatively within the Endless design system constraints
- For new pages: Tab switching always goes through URL params (`useParams`), not `useState`
- Type-check after changes: `cd web && bun run tsc --noEmit`

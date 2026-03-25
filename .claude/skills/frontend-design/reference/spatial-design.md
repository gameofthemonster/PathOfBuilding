# Spatial Design

## Spacing Systems

### Use 4pt Base

8pt systems are too coarse — you'll frequently need 12px (between 8 and 16). Tailwind's scale covers: 1(4px), 2(8px), 3(12px), 4(16px), 6(24px), 8(32px), 12(48px), 16(64px).

### Use Gap, Not Margins for Siblings

Use `gap-*` in flex/grid instead of margin on children — eliminates margin collapse and cleanup hacks.

```tsx
// DO: gap for sibling spacing
<div className="flex flex-col gap-4">
  <Item />
  <Item />
</div>

// DON'T: margin on children
<div>
  <Item className="mb-4" />
  <Item />
</div>
```

## Grid Systems

### The Self-Adjusting Grid

```tsx
// Responsive grid without media queries
<div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
```

### Named Areas for Complex Layouts

For dashboards and complex layouts, use `grid-template-areas` and redefine at breakpoints.

## Visual Hierarchy

### The Squint Test

Blur your eyes (or screenshot and blur). Can you still identify:
- The most important element?
- The second most important?
- Clear groupings?

If everything looks the same weight blurred, you have a hierarchy problem.

### Hierarchy Through Multiple Dimensions

Don't rely on size alone. Combine:

| Tool | Strong Hierarchy | Weak Hierarchy |
|------|-----------------|----------------|
| **Size** | 3:1 ratio or more | <2:1 ratio |
| **Weight** | `font-semibold` vs `font-normal` | `font-medium` vs `font-normal` |
| **Color** | High contrast | Similar tones |
| **Position** | Top/left (primary) | Bottom/right |
| **Space** | Surrounded by white space | Crowded |

**Best hierarchy uses 2-3 dimensions at once**: A heading that's larger, bolder, AND has more space above it.

### Cards Are Not Required

Cards are overused. Spacing and alignment create visual grouping naturally. Use cards only when:
- Content is truly distinct and actionable
- Items need visual comparison in a grid
- Content needs clear interaction boundaries

**Never nest cards inside cards** — use spacing, typography, and subtle dividers for hierarchy within a card.

## Container Queries

Viewport queries are for page layouts. **Container queries are for components**:

```tsx
// In your CSS
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { grid-template-columns: 120px 1fr; }
}
```

Or use Tailwind's `@container` support:
```tsx
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
```

## Optical Adjustments

Text at `margin-left: 0` looks indented due to letterform whitespace — use `-translate-x-px` or negative margin for optical alignment. Geometrically centered icons often look off-center — play icons need slight right shift.

### Touch Targets vs Visual Size

```tsx
// Small icon button with large touch target
<button className="w-6 h-6 relative flex items-center justify-center
  before:absolute before:inset-[-10px] before:content-['']">
  <Icon />
</button>
```

## Depth & Elevation

### Shadow Scale

Create semantic elevation, not arbitrary shadows:

```tsx
// Low elevation (cards, containers)
className="shadow-sm"

// Medium elevation (dropdowns, popovers)
className="shadow-md"

// High elevation (modals, dialogs)
className="shadow-lg"
```

**Key insight**: If you can clearly see the shadow, it's probably too strong.

### Z-Index Semantic Scale

| Layer | z-index | Use |
|-------|---------|-----|
| Dropdown | 10 | Select menus, tooltips |
| Sticky | 20 | Sticky headers |
| Modal backdrop | 30 | Dialog overlay |
| Modal | 40 | Dialog content |
| Toast | 50 | Notifications |

---

**Avoid**: Arbitrary spacing values outside the Tailwind scale. Equal spacing everywhere (variety creates hierarchy). Size-only hierarchy — combine size, weight, color, and space. Nesting cards inside cards.

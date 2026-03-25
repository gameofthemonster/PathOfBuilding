# Color & Contrast

## Color Spaces: Use OKLCH

**Stop using HSL.** Use OKLCH (or LCH) instead. It's perceptually uniform — equal steps in lightness *look* equal. HSL's 50% lightness looks bright in yellow but dark in blue.

```css
/* OKLCH: lightness (0-100%), chroma (0-0.4+), hue (0-360) */
--color-primary: oklch(60% 0.15 250);       /* Indigo */
--color-primary-light: oklch(85% 0.08 250); /* Same hue, lighter */
--color-primary-dark: oklch(35% 0.12 250);  /* Same hue, darker */
```

**Key insight**: As you approach white or black, reduce chroma. High chroma at extreme lightness looks garish.

## Endless Color System

The project uses **Tailwind + Reui Lyra theme** with:
- **Primary**: `indigo-*` — all interactive elements, focus rings, primary buttons
- **Base**: `neutral-*` — borders, backgrounds, muted text (already tinted toward cool-blue)
- **Semantic**: standard Tailwind red/yellow/green for danger/warning/success

### Key Color Tokens (Tailwind)

| Usage | Class |
|-------|-------|
| Primary button bg | `bg-indigo-600 hover:bg-indigo-700` |
| Focus ring | `focus:ring-1 focus:ring-indigo-100 focus:border-indigo-400` |
| Muted text | `text-neutral-500` |
| Standard border | `border-neutral-200` |
| Subtle background | `bg-neutral-50` |
| Danger | `text-red-500`, `bg-red-50` |

## The Tinted Neutral Trap

**Pure gray is dead.** Always add a subtle brand-hue tint to neutrals. In the Reui Lyra theme, `neutral-*` is already cool-tinted (toward indigo). Don't override this with pure grays:

```tsx
// DON'T: pure gray kills cohesion
className="bg-gray-100 text-gray-600"

// DO: use tinted neutral scale
className="bg-neutral-100 text-neutral-600"
```

## Contrast & Accessibility

### WCAG Requirements

| Content Type | AA Minimum | AAA Target |
|--------------|------------|------------|
| Body text | 4.5:1 | 7:1 |
| Large text (18px+) | 3:1 | 4.5:1 |
| UI components, icons | 3:1 | 4.5:1 |

**The gotcha**: Placeholder text still needs 4.5:1. The default `placeholder:text-neutral-400` may fail — use `placeholder:text-neutral-500` for better ratio.

### Dangerous Combinations

- Light gray text on white (the #1 fail — use `text-neutral-600` minimum for body)
- **Gray text on any colored background** — gray looks washed out on color; use a tint of the background color instead
- Red text on green (8% of men can't distinguish)
- Yellow text on white (almost always fails)

### Never Use Pure Gray or Pure Black

`oklch(50% 0 0)` and `#000` don't exist in nature — real shadows always have a color cast. The neutral Tailwind scale already handles this correctly. Don't override with `gray-*` from default Tailwind.

## Dark Mode

Dark mode is NOT inverted light mode. In the Endless dashboard context:

| Light Mode | Dark Mode |
|------------|-----------|
| Dark text on light | Light text on dark (reduce font weight) |
| Vibrant accents | Desaturate accents slightly |
| White backgrounds | Dark gray, never pure black |

```tsx
// Tailwind dark mode pattern
className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
```

## 60-30-10 Rule

- **60%**: Neutral backgrounds, white space, base surfaces
- **30%**: Neutral text, borders, inactive states
- **10%**: Indigo accent — CTAs, focus states, highlights

Overusing indigo kills its power. It works *because* it's rare.

## Alpha Is a Design Smell

Heavy use of `bg-opacity`, `text-opacity`, or `rgba` usually means an incomplete palette. Define explicit overlay colors instead. Exception: focus rings and hover states where transparency is intentional.

---

**Avoid**: Relying on color alone to convey information. Pure black/white for large areas. Skipping colorblind testing. Using `gray-*` instead of `neutral-*` (breaks theme cohesion). Gray text on colored backgrounds.

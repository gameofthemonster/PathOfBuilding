# Typography

## Classic Typography Principles

### Vertical Rhythm

Your line-height should be the base unit for ALL vertical spacing. If body text has `line-height: 1.5` on `16px` type (= 24px), spacing values should be multiples of 24px. This creates subconscious harmony—text and space share a mathematical foundation.

### Modular Scale & Hierarchy

The common mistake: too many font sizes that are too close together (14px, 15px, 16px, 18px...). This creates muddy hierarchy.

**Use fewer sizes with more contrast.** A 5-size system covers most needs:

| Role | Tailwind | Use Case |
|------|----------|----------|
| xs | `text-xs` | Captions, legal, metadata |
| sm | `text-sm` | Secondary UI, labels |
| base | `text-base` | Body text |
| lg | `text-lg` / `text-xl` | Subheadings, lead text |
| xl+ | `text-2xl` – `text-4xl` | Page headings, hero |

### Readability & Measure

Target 45–75 characters per line for body text. Use `max-w-prose` in Tailwind (equivalent to ~65ch).

Line-height scales inversely with line length — narrow columns need tighter leading, wide columns need more.

**Non-obvious**: Increase line-height for light text on dark backgrounds. Add 0.05–0.1 to your normal line-height.

## Font Selection & Pairing

### Choosing Distinctive Fonts

**Avoid the invisible defaults**: Inter, Roboto, Arial, Open Sans, Lato, Montserrat. These are everywhere, making your design feel generic.

**Better Google Fonts alternatives**:
- Instead of Inter → **Instrument Sans**, **Plus Jakarta Sans**, **Outfit**
- Instead of Roboto → **Onest**, **Figtree**, **Urbanist**
- For editorial/premium feel → **Fraunces**, **Newsreader**, **Lora**

**System fonts are underrated**: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` looks native, loads instantly, and is highly readable. Consider for developer tools where performance > personality.

### Pairing Principles

**The non-obvious truth**: You often don't need a second font. One well-chosen font family in multiple weights creates cleaner hierarchy than two competing typefaces. Only add a second font when you need genuine contrast (e.g., display headlines + body serif).

When pairing, contrast on multiple axes:
- Serif + Sans (structure contrast)
- Geometric + Humanist (personality contrast)
- Condensed display + Wide body (proportion contrast)

**Never pair fonts that are similar but not identical** (e.g., two geometric sans-serifs). They create tension without clear hierarchy.

### Web Font Loading

The layout shift problem: fonts load late, text reflows. Fix it:

```css
/* Use font-display: swap for visibility */
@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2') format('woff2');
  font-display: swap;
}

/* Match fallback metrics to minimize shift */
@font-face {
  font-family: 'CustomFont-Fallback';
  src: local('Arial');
  size-adjust: 105%;
  ascent-override: 90%;
  descent-override: 20%;
  line-gap-override: 10%;
}
```

## Tailwind Typography Patterns

### Hierarchy with Tailwind

```tsx
// Clear 3-level hierarchy
<h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">Page Title</h1>
<h2 className="text-base font-medium text-neutral-700">Section</h2>
<p className="text-sm text-neutral-500 leading-relaxed">Supporting text</p>
```

### Weight for Emphasis

```tsx
// Use weight contrast, not just size
<span className="text-sm font-medium text-neutral-900">Primary label</span>
<span className="text-sm text-neutral-500">Secondary label</span>
```

### Letter Spacing

- Tight for large headings: `tracking-tight`
- Normal for body text: (default)
- Wide for uppercase labels: `tracking-wider uppercase text-xs`

---

**Avoid**: Too many font sizes with too little contrast. Monospace for decorative "developer" vibes. Mixing 3+ font families. Ignoring font loading performance.

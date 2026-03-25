# Motion Design

## Duration: The 100/300/500 Rule

Timing matters more than easing. These durations feel right for most UI:

| Duration | Use Case | Tailwind |
|----------|----------|---------|
| **100–150ms** | Instant feedback | `duration-100` / `duration-150` |
| **200–300ms** | State changes, hover | `duration-200` / `duration-300` |
| **300–500ms** | Layout changes, accordions | `duration-300` / `duration-500` |
| **500–800ms** | Entrance animations | CSS only |

**Exit animations are faster than entrances** — use ~75% of enter duration.

## Easing: Pick the Right Curve

**Don't use `ease`.** It's a compromise that's rarely optimal.

| Curve | Use For | Tailwind |
|-------|---------|---------|
| **ease-out** | Elements entering | `ease-out` |
| **ease-in** | Elements leaving | `ease-in` |
| **ease-in-out** | State toggles | `ease-in-out` |

For micro-interactions, exponential curves feel natural:

```css
/* Quart out - smooth, refined (recommended default) */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

/* Expo out - snappy, confident */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

**Avoid bounce and elastic curves.** Real objects decelerate smoothly — they don't bounce.

## The Only Two Properties You Should Animate

**`transform`** and **`opacity`** only — everything else causes layout recalculation.

```tsx
// DO: animate transform and opacity
className="transition-transform duration-200 ease-out hover:-translate-y-0.5"
className="transition-opacity duration-150 data-[state=open]:opacity-100"

// DON'T: animate layout properties
// width, height, padding, margin, top, left → layout thrashing
```

For height animations (accordions), use `grid-template-rows: 0fr → 1fr` instead of animating `height` directly:

```css
.accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out;
}
.accordion-content[data-open] {
  grid-template-rows: 1fr;
}
.accordion-inner { overflow: hidden; }
```

## Tailwind Transition Patterns

```tsx
// Color transitions (most common)
className="transition-colors duration-150"

// Multiple properties
className="transition duration-200 ease-out hover:shadow-md hover:-translate-y-0.5"

// Opacity for show/hide
className="transition-opacity duration-200 opacity-0 data-[visible]:opacity-100"
```

## Staggered Animations

Use CSS custom properties for cleaner stagger:

```tsx
// In TSX
items.map((item, i) => (
  <div key={item.id} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-in">
))
```

**Cap total stagger time** — 10 items at 50ms = 500ms total. For many items, reduce per-item delay or cap at 5 items.

## Reduced Motion

This is not optional. Vestibular disorders affect ~35% of adults over 40.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Tailwind alternative: use `motion-safe:` and `motion-reduce:` variants:

```tsx
className="motion-safe:transition-transform motion-reduce:transition-none"
```

## Perceived Performance

- **80ms threshold**: Anything under 80ms feels instant
- **Optimistic UI**: Update immediately, sync later — Instagram likes work offline
- **Skeleton screens > spinners**: Preview content shape, feel faster
- **Early completion**: Show content progressively, don't wait for everything

---

**Avoid**: Animating layout properties (width, height, padding, margin). Bounce/elastic easing. Ignoring `prefers-reduced-motion`. Using animation to hide slow loading. Animating everything (animation fatigue is real).

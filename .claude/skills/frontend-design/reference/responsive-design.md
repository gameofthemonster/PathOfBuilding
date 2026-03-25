# Responsive Design

## Mobile-First: Write It Right

Start with base styles for mobile, use `min-width` queries to layer complexity. Desktop-first (`max-width`) means mobile loads unnecessary styles first.

```tsx
// DO: mobile-first (Tailwind default)
className="text-sm md:text-base lg:text-lg"
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// DON'T: desktop-first
className="text-lg md:text-base sm:text-sm"
```

## Breakpoints: Content-Driven

Tailwind breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1536px).

**Three breakpoints usually suffice**: sm, md, lg. Don't add breakpoints for device sizes — let content tell you where to break.

Use `clamp()` for fluid values without breakpoints:

```css
/* Fluid font size: 14px on mobile, up to 18px on desktop */
font-size: clamp(0.875rem, 2.5vw, 1.125rem);

/* Fluid spacing: 16px to 48px */
padding: clamp(1rem, 4vw, 3rem);
```

## Detect Input Method, Not Just Screen Size

**Screen size doesn't tell you input method.** Use pointer and hover queries:

```css
/* Fine pointer (mouse, trackpad) */
@media (pointer: fine) {
  .button { padding: 8px 16px; }
}

/* Coarse pointer (touch) */
@media (pointer: coarse) {
  .button { padding: 12px 20px; } /* Larger touch target */
}
```

Tailwind's `hover:` modifier only applies when the device supports hover — safe to use. But don't rely on hover for functionality; touch users can't hover.

## Container Queries

Viewport queries are for page layouts. **Container queries are for components** that need to adapt based on their container's size, not the viewport:

```tsx
// Tailwind @container support
<div className="@container">
  <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
    {/* Adapts to container, not viewport */}
  </div>
</div>
```

This is especially valuable for components that appear in different contexts (sidebar vs. main content area).

## Safe Areas: Handle the Notch

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* With fallback */
.footer {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

Enable in meta tag:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

## Touch Targets

Minimum 44x44px for all interactive elements on touch devices. Use padding to expand small icons:

```tsx
// Small icon button with large touch target
<button className="p-3 -m-1 flex items-center justify-center">
  <Icon size={16} />
</button>
```

## Layout Adaptation Patterns

### Navigation
- Mobile: hamburger + drawer / bottom tabs
- Desktop: horizontal nav with labels

### Tables
Transform to stacked cards on mobile:

```tsx
// Responsive table approach
<div className="overflow-x-auto md:overflow-visible">
  <table className="min-w-full">
    {/* Full table on md+, scrollable on mobile */}
  </table>
</div>
```

Or use `@container` to switch from table to card layout.

### Progressive Disclosure

Use `<details>/<summary>` or collapsible sections for content that can be hidden on mobile:

```tsx
<details className="md:hidden">
  <summary className="cursor-pointer text-sm font-medium text-neutral-700">
    Advanced options
  </summary>
  <div className="pt-2">...</div>
</details>
```

## Responsive Images

```html
<img
  src="hero-800.jpg"
  srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Hero image"
  loading="lazy"
>
```

## Testing

DevTools device emulation misses:
- Actual touch interactions
- Real CPU/memory constraints
- Font rendering differences
- Browser chrome + keyboard appearances

**Test on at least**: One real iPhone, one real Android, desktop at 1280px and 1440px.

---

**Avoid**: Desktop-first design. Device detection instead of feature detection. Hiding critical functionality on mobile. Assuming all mobile devices are powerful. Ignoring landscape orientation.

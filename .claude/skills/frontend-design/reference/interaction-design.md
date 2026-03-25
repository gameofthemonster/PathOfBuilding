# Interaction Design

## The Eight Interactive States

Every interactive element needs these states designed:

| State | When | Treatment in Tailwind |
|-------|------|-----------------------|
| **Default** | At rest | Base styling |
| **Hover** | Pointer over | `hover:bg-neutral-50`, `hover:text-neutral-900` |
| **Focus** | Keyboard/programmatic | Visible ring — see below |
| **Active** | Being pressed | `active:scale-95`, `active:opacity-80` |
| **Disabled** | Not interactive | `disabled:opacity-50 disabled:cursor-not-allowed` |
| **Loading** | Processing | Spinner, skeleton, or `disabled` + spinner |
| **Error** | Invalid state | Red border, icon, message |
| **Success** | Completed | Green check, confirmation |

**The common miss**: Designing hover without focus, or vice versa. Keyboard users never see hover states.

## Focus Rings: Do Them Right

**Never `outline-none` without replacement.** Use `:focus-visible` to show focus only for keyboard users:

```tsx
// Endless standard focus pattern
className="outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 focus-visible:border-indigo-400"

// For buttons (no border)
className="outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
```

Focus ring design requirements:
- High contrast (3:1 minimum against adjacent colors)
- 2–3px thick, offset from element
- Consistent across ALL interactive elements

## InputGroup Pattern

When combining icon prefix + input:

```tsx
<div className="flex border border-neutral-200 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition-colors">
  <div className="flex items-center px-2.5 text-neutral-400 border-r border-neutral-200 shrink-0">
    <MagnifyingGlass size={16} />
  </div>
  <input
    className="flex-1 px-3 py-2 text-sm outline-none bg-white placeholder:text-neutral-400"
    placeholder="Search..."
  />
</div>
```

The outer wrapper manages the border + focus ring. Inner elements have no independent border.

## Form Design: The Non-Obvious

**Placeholders are not labels** — they disappear on input. Always use visible `<label>` elements. **Validate on blur**, not on every keystroke (exception: password strength). Place errors **below** fields with `aria-describedby` connecting them.

## Loading States

**Optimistic updates**: Show success immediately, rollback on failure. Use for low-stakes actions (likes, follows), not payments or destructive actions.

**Skeleton screens > spinners** — they preview content shape and feel faster:

```tsx
// Skeleton pattern with Tailwind
<div className="animate-pulse space-y-3">
  <div className="h-4 bg-neutral-200 w-3/4" />
  <div className="h-4 bg-neutral-200 w-1/2" />
  <div className="h-4 bg-neutral-200 w-5/6" />
</div>
```

## Destructive Actions: Undo > Confirm

**Undo is better than confirmation dialogs** — users click through confirmations mindlessly.

Use `ConfirmDialog` (from `web/src/components/ui/`) for truly irreversible actions:

```tsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete session"
  description="This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  loading={isDeleting}
  onConfirm={handleDelete}
/>
```

For recoverable actions, implement undo with a toast instead.

## Keyboard Navigation Patterns

### Roving Tabindex

For tabs, menu items, radio groups — one item is tabbable; arrow keys move within:

```tsx
<div role="tablist">
  <button role="tab" tabIndex={activeTab === 0 ? 0 : -1}>Tab 1</button>
  <button role="tab" tabIndex={activeTab === 1 ? 0 : -1}>Tab 2</button>
</div>
```

### Skip Links

Provide skip links for keyboard users to jump past navigation. Hide off-screen, show on focus:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-indigo-600 focus:border focus:border-indigo-400">
  Skip to main content
</a>
```

## Gesture Discoverability

Swipe gestures are invisible. Always provide a visible fallback (menu with "Delete"). For mobile actions, hint at gesture existence or use `DropdownMenuItem` instead.

---

**Avoid**: Removing focus indicators without alternatives. Using placeholder text as labels. Touch targets <44x44px. Generic error messages ("Something went wrong"). Custom controls without ARIA/keyboard support. Modal for everything — modals are lazy.

# Dues: design system

*The visual rules behind every screen. Tokens live in `src/app/globals.css`; reasons are in [DECISIONS.md](DECISIONS.md) (D27, D42, D48, D51).*

## Direction
A calm money tool: a dark sidebar, a neutral canvas, white panels, ink buttons, and one orchid accent used sparingly. Colour carries meaning only for status.

## Colour (D42)
| Token | Value | Used for |
|---|---|---|
| `--background` | `#FAFAFA` | Canvas |
| `--card` | `#FFFFFF` | Panels and cards |
| `--border` | `#EBEBEB` | Borders and dividers |
| `--foreground` / `--primary` / `--sidebar` | `#171717` | Text, main buttons, sidebar, dark blocks |
| `--muted-foreground` | `#5C5C5C` | Secondary text |
| `--brand-vivid` | `#DA5CC7` | Logo, fills, 24px+ type only |
| `--brand` | `#A82E92` | Accent text and links, active nav icon, count chips |
| `--brand-soft` | `#FBF0F9` | Tinted surfaces |
| `--brand-on-dark` | `#E766D4` | Accent on dark surfaces |
| `--tone-faint` / `--tone-mid` / `--tone-strong` | `#D4D4D4` / `#A3A3A3` / `#5C5C5C` | Status dots, aging bar (D48) |

**Status colours** are separate from the brand and never decorative:

| Meaning | Token | Value |
|---|---|---|
| Overdue, caution | `--late`, `--attention` | `#B54708` on `#FFF6ED` |
| Error, danger | `--danger`, `--destructive` | `#B42318` on `#FEF3F2` |
| Paid | `--paid` | `#067647` on `#ECFDF3` |
| Needs review, payment reported | `--review` | `#454545` |

**Contrast (WCAG AA is 4.5:1 for body text, 3:1 for large text):**

| Pairing | Ratio |
|---|---|
| Ink `#171717` on white | 17.9:1 |
| `#5C5C5C` on white | 6.7:1 |
| `#A82E92` on white | 6.05:1 |
| `#A82E92` on `#FBF0F9` | 5.5:1 |
| `#DA5CC7` on white | 3.3:1 (large type and graphics only) |
| `#E766D4` on ink | 6.2:1 |
| Overdue `#B54708` on white | 5.4:1 |
| Error `#B42318` on white | 6.6:1 |
| Paid `#067647` on white | 5.7:1 |

No background gradients. Gradients are not used on text either (D51).

## Type
- **Geist everywhere:** the app and the landing page body, nav, buttons and mock invoice. It has true tabular figures, a ₹ glyph that matches, and good legibility on Android.
- **Fraunces** only for the landing page's h1 and h2 and its two display lines (the tagline and "45 days"), loaded with `next/font`. It includes ₹ (D51, narrowed by D54).
- **Money:** always tabular figures (the `amount` utility; `.landing` sets `tabular-nums`), so columns of rupees line up.
- **Named text styles** instead of loose sizes and weights: `heading-3` to `heading-6`, `title-2` to `title-4`, `body-1`, `body-3` to `body-6`, `caption-3` to `caption-5`.

## Spacing and shape
- **Spacing scale:** 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 px. Nothing in between (D48).
- **Radius:** Tailwind's scale. A shape nested inside another uses outer radius minus the gap, e.g. 12px panel, 4px padding, 8px item.
- **Borders** go all the way round or not at all.

## Components and icons
- **Icons:** Phosphor (server components import from `@phosphor-icons/react/dist/ssr`).
- **Buttons:** ink default, outline, secondary, ghost, destructive and destructive-outline. One main action per screen (D34).
- **Copy buttons** are icon-only, with a specific screen-reader label and tooltip ("Copy IFSC").
- **Status** is a dot and a word, never colour alone.
- **Shared building blocks** in `src/components/ds.tsx`: `PageHeader`, `Section`, `Panel`, `Amount`, `Banner`, `DetailList`.

## Motion
Almost none. The FAQ "+" rotates in 200ms, and reduced motion turns it off. Content is never hidden waiting for an animation (D51).

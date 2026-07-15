# Mirrorting Frontend Improvement Plan

## Fixed Decisions

- Product story: 4-Fit analysis, AI roleplay, report, retry comparison, and growth loop.
- Motion: Framer Motion with strong scroll storytelling.
- Responsive scope: PC, tablet, and mobile parity.
- Mobile navigation: hamburger opens a bottom-sheet menu.
- Icon system: replace major product-section Lucide icons with custom SVG icons.
- UX writing: Korean 해요체, active voice, positive/recoverable phrasing, and predictable CTA labels.

## Implementation Checklist

- [x] Wave 1: Create `DESIGN.md` as the root design contract.
- [x] Wave 1: Create this implementation checklist.
- [x] Wave 1: Add `framer-motion`.
- [x] Wave 1: Add `MotionSection`, `MobileMenuSheet`, `MirrortingIcon`, and `ProductBenefitSection`.
- [x] Wave 2: Add scroll-driven product benefits below the home hero.
- [x] Wave 3: Reduce visible information density on selection flows with compact summary/help panels.
- [x] Wave 4: Add mobile hamburger and bottom-sheet navigation.
- [x] Wave 5: Replace major product/role/scenario/fit icons with custom SVG icons.
- [x] Wave 6: Run production build.
- [x] Wave 6: Run real browser QA at 375px, 768px, and 1280px.
- [x] Wave 6: Capture screenshots and overflow/accessibility checks.

## Acceptance Criteria

- Home hero loads and benefit sections animate while scrolling.
- `prefers-reduced-motion` disables non-essential animation.
- Mobile menu opens and closes without trapping the user.
- Every screen keeps clear CTA copy and avoids unexpected blocking prompts.
- No horizontal overflow or clipped card text at 375px, 768px, or 1280px.
- Major product icons are custom SVG icons and render with current color.
- `npm run build` passes.

## QA Evidence Targets

- Desktop screenshot: `/tmp/mirrorting-home-desktop.png`
- Tablet screenshot: `/tmp/mirrorting-home-tablet.png`
- Mobile screenshot: `/tmp/mirrorting-home-mobile.png`
- Browser QA JSON summary: `/tmp/mirrorting-frontend-qa.json`

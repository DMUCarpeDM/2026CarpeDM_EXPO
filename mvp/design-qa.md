# Design QA — 3-way selector and mode homes

Date: 2026-08-31

## Scope

- Three-column service selector.
- Interview, vocational training, and workplace conversation Home pages only.
- Existing scenario selection, practice, report, backend, and analysis routes were treated as protected behavior.

## Source visual truth

- `docs/design-targets/mode-selector-target-v1.png` — 1672 × 941.
- `docs/design-targets/interview-home-target-v1.png` — 864 × 1821.
- `docs/design-targets/training-home-target-v1.png` — 864 × 1821.
- `docs/design-targets/workplace-home-target-v1.png` — 864 × 1821.

## Implementation surfaces

- `src/pages/setup/ServiceModeSelectPage.jsx`
- `src/pages/HomePage.jsx`
- `src/components/ui/shadcn.jsx`
- `src/components/navigation/AppNavigation.jsx`
- `src/pages/ServiceEntryShell.jsx`
- `src/styles/service-mode-select.css`
- `src/styles/mode-home.css`
- `src/styles/shadcn-ui.css`

## Viewports and state

- Desktop visual pass: 1440 × 900, fresh selector and fresh Home for each selected mode.
- Mobile visual pass: 390 × 844, fresh selector and fresh Home for each selected mode.
- Desktop full-page evidence uses three fixed 1440 × 900 segments per Home. The in-app browser full-page compositor duplicated sticky sections, so the report uses fixed segments rather than accepting invalid stitched output.
- Target and implementation were normalized into the same combined comparison images before judgment.

## Combined comparison evidence

- `artifacts/design-qa/compare-mode-selector-final-v3.jpg`
- `artifacts/design-qa/compare-interview-home-final.jpg`
- `artifacts/design-qa/compare-training-home-final.jpg`
- `artifacts/design-qa/compare-workplace-home-final.jpg`
- Mobile evidence:
  - `artifacts/design-qa/selector-mobile-final.jpg`
  - `artifacts/design-qa/interview-mobile-final.jpg`
  - `artifacts/design-qa/training-mobile-final.jpg`
  - `artifacts/design-qa/workplace-mobile-final.jpg`

## Fidelity review

- Layout: selector retains a white canvas, one-row equal cards, restrained borders, and image-over-title hierarchy. Each Home uses a distinct composition while reusing the same section, card, button, progress, badge, and accordion primitives.
- Spacing: desktop content rails, section spacing, card gaps, and mobile stacking preserve hierarchy without overlap or horizontal clipping.
- Typography: Korean display copy uses deliberate keep-all wrapping, strong weight contrast, and readable body line height on desktop and mobile.
- Color: the only accent families are blue `#0071e3`, orange `#f05a24`, and violet `#6e5ed2`. Neutral whites, grays, and pale tints are not additional accents.
- Imagery: all selector cards now use actual raster assets. Runtime div/CSS preview illustrations were removed. The training asset was corrected from green to orange, and the workplace asset uses blue/violet only.
- Icons: product UI uses one consistent Reicon family. Selector imagery does not add separate decorative icons.
- Responsive behavior: measured `scrollWidth === innerWidth` at 1440 px and 390 px for the selector and all three Home variants.
- Accessibility: selector cards have exact accessible names, stable `aria-pressed="false"`, visible keyboard focus, descriptive image alt text, and no nested interactive elements. Interview numbered question tabs now expose the full question in their accessible names.

## Interaction checks

- Selector cards activate by mouse and keyboard, retain the chosen Home through navigation, and clear focus/selection when returning.
- Interview question 2 updates the console heading to `지원한 직무를 선택한 이유는 무엇인가요?`.
- Training step selection updates the active heading to `처리 순서 안내` and progress to 75%.
- Training FAQ expands with `aria-expanded="true"`.
- Primary Home actions continue to the existing setup flow for all three modes.
- Browser integration runs reported no page errors.

## Findings and fixes

- P1 fixed: selector title and preview were laid out side-by-side because a legacy `.choice-card` rule won the cascade. Added a scoped grid reset so image and title return to the target's vertical hierarchy.
- P1 fixed: training and workplace previews were runtime div art. Replaced both with generated raster UI assets and preserved the one-image-per-card accessibility contract.
- P1 fixed: route regression selectors no longer identified the redesigned Home. Restored the stable `.home-page`, `.hero-actions`, `.choice-card`, and `.service-mode-card` contracts without reverting the new design.
- P2 fixed: selector title alignment differed from the target. Centered the title band.
- P2 fixed: the training preview introduced a fourth green accent. Recolored that asset to the approved orange family.
- P2 fixed: numbered interview tabs lacked descriptive accessible names. Added the full question label.
- No remaining P0, P1, or P2 findings.

## Verification

- `npm test`: 114 passed, 0 failed.
- `npm run build`: passed.
- Build warning: the existing production bundle still exceeds Vite's 500 kB advisory threshold; this is outside the requested Home/selector visual scope and does not block the build.

## Final Result

passed

## UX writing and heading-weight pass — 2026-08-31

- Applied the Toss writing principles relevant to this screen: short spoken sentences, `해요체`, active and positive phrasing, one key message per sentence, and CTA labels that predict the next `직무 선택` screen.
- Reduced the shared Home display-heading weight from `750` to `650` for hero H1, section H2, and footer H2. Component-level card headings were intentionally unchanged.
- Verified all three Home variants at 1280 px and 390 px with `scrollWidth === innerWidth` and computed display-heading weight `650`.
- Verified the primary Home CTA opens the existing `직무 선택` step.
- Comparison evidence: `.lazyweb/lazyweb-growth-report/ux-writing-2026-08-31/references/before-after.jpg`.
- `npm test`: 114 passed, 0 failed.
- `npm run build`: passed; only the existing Vite chunk-size advisory remains.

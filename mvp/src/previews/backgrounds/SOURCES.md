# Preview background components

Fetched 2026-10-23. Used only by fit-components-preview.html.

- Magic UI Dot Pattern: https://magicui.design/r/dot-pattern.json
- Magic UI Animated Grid Pattern: https://magicui.design/r/animated-grid-pattern.json
  - Source copied from official registry. Imports point to existing framer-motion and cn helper. Tailwind positioning/color classes supplied by preview CSS. Animated Grid accepts paused to support reduced motion and pause control. MIT license retained in MAGIC-UI-LICENSE.md.
- React Bits Aurora and LightRays: https://github.com/DavidHDev/react-bits/tree/main/src/content/Backgrounds
  - Official JSX/CSS files retained. Native WebGL, no new package dependency. Light mode and Mirror-Ting blue parameters passed by preview. Original license retained in REACT-BITS-LICENSE.md.
- Aceternity Grid and Dot Backgrounds: https://ui.aceternity.com/components/grid-and-dot-backgrounds
- Aceternity Spotlight New: https://ui.aceternity.com/components/spotlight-new
  - Registry endpoint returned 403; these two are documentation-based adaptations, not claimed as exact copies of the original source. Grid and radial fade translated to CSS; Spotlight mirrors three rotated gradients with the documented 7 second / 100px movement. UI footer identifies the adaptations.

The existing FitAnalysisPages renderer now accepts an optional stageBackground element. Original main pages do not pass it, so their appearance and scroll behavior remain the same.

QA: fit-components-qa.mjs covers 390/1440px six variants, original 4 images, scroll state preservation, no horizontal overflow, no runtime errors, canvas dimensions, pause control and reduced-motion reading state.

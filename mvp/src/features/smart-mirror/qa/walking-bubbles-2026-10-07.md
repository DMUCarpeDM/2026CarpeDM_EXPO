# Walking sprite and speech bubble QA — 2026-10-07

## Scope
Existing silver palette and summary reading layout retained. Background alone now spans the viewport. Removed the two standalone conversational anonymous actors; one arriving anonymous actor remains. Reception/table employees already painted into the arrival PNG remain.

## Walking size correction
Participant idle alpha height is 147 source pixels. Walking frame alpha heights are 138,119,141,129, so the second frame previously appeared about 19% smaller than idle. Frame-specific scales are 147/138,147/119,147/141,147/129. Scaling uses walking foot baseline y=150; a 4/160 frame-height translation aligns it to idle baseline y=154. Only walking sprites are scaled; labels and stationary sprites are unchanged.

Actual browser sampling captured all four background positions and their respective scale values while walking. The name label stayed 10px throughout. Corrected visible heights calculate to approximately 147 source-equivalent pixels; this is source alpha analysis plus computed CSS verification, not a raster pixel comparison.

## Speech designs
Default: compact silver glass. Alternatives: stepped pixel window and horizontal dialogue caption. Shared text size reduced from 1.15vh to 1.05vh, retaining the 12px minimum; padding also slightly reduced. Comparison uses the real office/bubble components at the same arrival conversation state. Comparison-only automatic caption is hidden to avoid irrelevant clipped content.

## Verification
- Actual browser viewport: 2160×3840 CSS pixels.
- Background bounds: left 0, right 2160, width 2160.
- One anonymous actor present; standalone conversation pair absent.
- Speech bubble bounds at sampled arrival dialogue: left 758.60, right 1487.79, inside scene.
- No horizontal or vertical document overflow at portrait 4K.
- Desktop walking samples: all four frame positions/scales observed; name label stable.
- 12 targeted tests pass: workplace emotion/track, mirror timeline, movement, consent/reduced-motion guards and conversation proximity.
- Vite production build passes; existing large chunk warning remains.
- Real TV/glass optics and OS reduced-motion rendering have not been tested on hardware.

## Evidence
Local review: `/src/features/smart-mirror/previews/bubbles/index.html`.
Local captures: `/Users/yanghyojae/Documents/Expo Design/output/mirror-bubbles/` (`comparison.png`, `4k-after.png`, `4k-qa.json`, `walk-samples.json`).
Lazyweb reference search and screenshot report completed. Public report: https://www.lazyweb.com/report/lazyweb/a41c0973-4bd4-4d9d-86da-704a1c98e2f1/?source=create (free preview).

## Final selection
User retained the original rectangular bubble, with the prior compact sizing. Tail increased from .65vh to 1vh (about 54%). Removed alternative styles, comparison preview and variant component. Walking correction, single anonymous arrival and full-width background retained.

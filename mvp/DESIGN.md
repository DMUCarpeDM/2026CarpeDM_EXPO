# Mirror-Ting Design System

## 1. Atmosphere & Identity

Mirror-Ting feels like a calm AI coaching studio for workplace conversations. The signature is a bright Apple-like canvas with selective Liquid Glass overlays around camera, AI question, action, and 4-Fit feedback moments. The product should feel supportive and precise, not evaluative or noisy.

Apple HIG interpretation for this product: keep the interface clear, defer decoration behind the user's task, and make every control feel directly manipulable. A screen should present one main decision, one primary next action, and secondary details only when they help the current step.

### Reference-fidelity direction

The supplied Mirror-Ting desktop boards are the visual contract for the exhibition flow. They use a bright, translucent floating header that becomes clearly visible on hover or keyboard focus; generous 24–32px gutters; thin cool-gray dividers; blue rectangular CTAs with a restrained 10–12px radius; and white cards with a soft blue-gray lift. Setup is a two-column decision surface with a pale-blue selection summary. Its three steps are `직무 선택`, `시나리오 선택`, and `난이도 선택`: each step asks for one decision only. Analysis is a dense but calm desktop report: a score rail, coaching overview, metric rows, and a compact radar visual. Practice is the one intentionally dark surface, with the live camera as the primary object and glass feedback panels around it.

The remembered moment is the transition from live camera practice to a precise 4-Fit coaching report. Decorative photos are subordinate to that flow: use the real camera when permission is granted, and use a neutral camera state when it is not. The home hero is a single-column canvas with the supplied high-resolution device render fixed as its right-side background rather than as a separate media column. No sidebar is used anywhere; the shared top header carries navigation and utilities.

## 2. Color

| Role | Token | Light | Usage |
|---|---|---:|---|
| Text/primary | `--color-ink` | `#191f28` | Headings, primary labels |
| Text/secondary | `--color-graphite` | `#4e5968` | Body and secondary labels |
| Text/muted | `--color-muted` | `#8b95a1` | Metadata, helper text |
| Surface/canvas | `--color-fog` | `#f4f6f8` | Page background |
| Surface/card | `--color-snow` | `#ffffff` | Cards and panels |
| Accent/primary | `--color-blue` | `#0064ff` | Primary CTA, active state |
| Accent/soft | `--color-blue-soft` | `#eaf2ff` | Selected soft surface |
| Accent/analog | `--color-sky` | `#0ea5e9` | Secondary emphasis, supportive positive state |
| Accent/analog soft | `--color-sky-soft` | `#e8f7ff` | Secondary soft surface |
| Accent/warm | `--accent-warm` | `#ff8a00` | Single warm emphasis for caution, posture, harder difficulty |
| Accent/warm soft | `--accent-warm-soft` | `#fff3e3` | Warm soft surface |
| Selection/canvas | `--color-selection-wash` | `#f5f8ff` | Setup page and summary backdrop |
| Selection/border | `--color-selection-border` | `#dce6f4` | Setup cards and summary rows |
| Border/default | `--color-border` | `rgba(25,31,40,0.08)` | Cards, dividers |
| Glass/light | `--color-glass` | `rgba(255,255,255,0.78)` | Floating glass surfaces |
| Status/success | `--success` | `#0ea5e9` | Positive states, kept in the blue analog ramp |
| Status/warning | `--warning` | `#ff8a00` | Caution states |
| Status/error | `--danger` | `#d93843` | Recoverable errors and the highest-difficulty badge, reserved and not used for ordinary emphasis |
| Fit/response | `--fit-response` | `#0064ff` | Response-Fit |
| Fit/voice | `--fit-voice` | `#2f7cff` | Voice-Fit |
| Fit/eye | `--fit-eye` | `#0ea5e9` | Eye-Fit |
| Fit/posture | `--fit-posture` | `#ff8a00` | Posture-Fit |

Rules: use blue and sky as the analogous emphasis ramp, keep `--accent-warm` as the only non-blue emphasis, and extend this table before adding new semantic colors. Green/purple/red tone names may remain as legacy class aliases, but their rendered colors must map back to this table.

## 3. Typography

Primary font stack: `"SF Pro Text", "Inter", "Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.

| Level | Size | Weight | Line Height | Usage |
|---|---:|---:|---:|---|
| Display | `clamp(48px, 5.6vw, 70px)` | 680 | 1.13 | Home hero |
| H1 | `clamp(34px, 4vw, 52px)` | 680 | 1.14 | Page titles |
| H2 | `28px` | 620 | 1.25 | Section headings |
| H3 | `20px` | 560-620 | 1.35 | Card titles |
| Body | `17px` | 430 | 1.6 | Main copy |
| Body/sm | `14px` | 430 | 1.5 | Helper copy |
| Caption | `12px` | 560 | 1.4 | Labels |

Korean text uses `word-break: keep-all`, `line-break: strict`, and `text-wrap: pretty` where supported.

## 4. Spacing & Layout

Base unit: `4px`.

| Token | Value | Usage |
|---|---:|---|
| `--space-2` | `8px` | Inline icon gaps |
| `--space-3` | `12px` | Compact padding |
| `--space-4` | `16px` | Standard UI padding |
| `--space-5` | `20px` | Card inner rhythm |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Group gaps |
| `--space-12` | `48px` | Section gaps |
| `--space-20` | `80px` | Hero rhythm |

Desktop maximum width is `1484px` for standard browser review and `1720px` for the 1920x1080 kiosk exhibition viewport. Mobile collapses to one column, with the global navigation becoming a hamburger-triggered bottom sheet.

Home sections keep a larger display rhythm: 80px top separation on desktop, 56–58px on mobile. The hero visual is a 16:10 high-resolution product render; analysis and benefit boards are intentionally taller than ordinary content cards.

The home hero, 4-Fit board, and five-method benefit board share the same centered `1560px` content rail on desktop, matching the floating navigation width. The hero background carries through to the first section divider; the primary home CTA stays left-aligned within this rail, with its label centered inside the button and its trailing arrow at the far edge.

Flow rule: setup pages may show compact step context, but practice, feedback, and report pages should not repeat large step pills. Those pages use page title, toolbar, and one clear CTA instead.

## 5. Components

### Global Navigation
- Structure: a floating circular-end translucent bar with brand, desktop nav links, right utility actions, and mobile hamburger.
- States: resting header is subtle; hover and keyboard focus increase white opacity, border contrast, and shadow. Active nav item uses blue, mobile menu opens a bottom sheet.
- Accessibility: menu button exposes expanded state and the sheet has a close button.

### Primary CTA
- One primary CTA per screen.
- Pill shape, blue fill, white text, clear next-action label.
- Press state scales subtly.

### Selection Card
- Used for role, counterpart, difficulty, scenario, and time choices.
- Default: white surface, 1px cool-gray border, 16px internal padding.
- Selected: blue border, pale-blue wash, blue check badge in the top-right corner.
- A card remains a button, so the full card is keyboard-operable.
- Setup job cards use generated, person-free 3D profession icons as decorative images with a text title and explanation below them. Scenario and difficulty cards use the same generated 3D icon family. The text remains the accessible label; every decorative image must use empty alt text.

### Setup Selection Catalog
- The setup state is direct: `직무 → 시나리오 → 난이도`. Each catalog is independent, so a choice never silently replaces a later choice.
- Scenario cards are populated from the active PoC scenario API. Their title and description remain the accessible name and outcome; an initial day/time stamp is not repeated in the card description.
- The existing PoC `difficulty`, `mode`, and `scenario_slug` payload remains unchanged. The selected scenario card supplies the `scenario_slug` used to start the backend session.

### Setup Flow
- Three reusable pieces work together: `MiniStepper` for the current step, `ChoiceSection` plus `ChoiceCard` for each decision, and `SetupFlowActions` for the bottom back/next pair.
- Desktop uses a left content column and a sticky right `SelectionSummary` panel. The right panel immediately reflects the job, situation, difficulty, and expected duration, while the main column exposes only decisions for the current step.
- The interaction state is direct: click a full card to select it, then use “다음 단계로” to continue. The setup screen does not expose a separate situation catalog.

### Fit Metric
- Used in home snapshot, live practice feedback, report, and comparison.
- Home snapshot uses enlarged generated 3D metric medallions, a numeric value, and a compact line trend; its aggregate is a four-axis radar chart with score and average series. The explanatory copy sits directly below the 4-Fit title, without a competing CTA.
- Keep Response, Voice, Eye, and Posture colors stable across every route.

### UX Writing
- Use casual Korean `해요체`, active voice, and positive wording.
- Prefer a direct action and outcome: “대화를 연습해요”, “다음에 바꿔볼 점을 알려드려요”.
- Avoid formal honorifics, passive phrasing, and stacked noun phrases when a simple verb explains the same action.

### Product Benefit Section
- Home closes with a five-column benefit board: AI roleplay, custom report, comparison, growth history, and confident communication.
- Each chapter uses one generated blue 3D medallion asset, centered heading and two-level explanatory copy, and shared card primitives. Cards do not add a competing CTA; the primary practice action stays in the hero.
- Desktop keeps five equal columns; mobile stacks them in one column.

### Service Demo Section
- Structure: centered benefit headline, two large live-assist demo cards, three calm advantage visuals, and a split transcript/metric block.
- Reference principle: Cluely-like progressive information density, adapted to Mirror-Ting coaching ethics and existing tokens.
- Copy rule: describe what the AI helps the user do, not what the AI does secretly or instead of the user.

### Reicon SVG Icon
- Mirror-Ting uses the public Reicon React set for interactive utilities, role, scenario, difficulty, section, and 4-Fit icons. The five home benefit icons are generated 3D image assets to match the supplied marketing board.
- Icons use Reicon's 24px grid, Outline weight, 1.5px stroke override where supported, and inherit current color.
- `IconGlyph` owns semantic mapping such as `response`, `voice`, `eye`, `posture`, `interview`, `presentation`, `negotiation`, `feedback`, `easy`, `normal`, and `hard`.
- Direct utility icons must stay secondary and use geometric precision rendering.

### Liquid Glass Panel
- Used only for camera overlays, floating controls, nav, live status, and compact feedback surfaces.
- Not every card should be glass.

### Practice Glass Panel
- Used in the AI practice screen for live status and roleplay chat panels so they visually belong to the camera surface.
- Surface: dark translucent glass, white text hierarchy, muted inner cards, and one chevron disclosure control in the header.
- Behavior: panels can collapse to their header when the practice screen becomes crowded, without changing the primary recording action.
- Desktop placement: panels live inside the camera frame, leave room for the recording controls, and should not exceed roughly one third of the frame width.
- The tool status panel is one desktop row of four equal tool cards. Each card uses a real connection-derived ON/OFF switch state; it is status only, not a fake control.
- The current AI question lives in a semi-transparent dark glass panel inside the video so the counterpart remains visible. It shows the prepared `speaking` video while ElevenLabs TTS is active; if that service is unavailable, browser TTS is the fallback. The waveform animates only in that state.
- When the AI counterpart is the main stage, the learner camera and MediaPipe markers remain visible in a compact top-right PiP, matching a familiar video-call layout without interrupting analysis.
- The answer input stays directly below the question panel, with a named `전송` button. When browser speech recognition finalizes an utterance, wait three seconds for continued speech, then submit the answer automatically. Typing, pausing, or another interim result cancels that pending submission.
- When the AI TTS finishes, the on-video AI question panel closes with it; the persisted question remains in the side log.
- The side log shows the persisted AI question and learner answer. It does not repeat the hidden template reaction text as a second AI message.

### Disclosure Panel
- Used for secondary report, coaching, and recommendation details after the primary result is already visible.
- Header is a full-width semantic button with a chevron and clear `aria-expanded` state.
- Default state: keep the next action and the most important insight visible; collapse supporting metadata or optional learning recommendations.

### Simulation Readiness Board
- Used only on the pre-practice confirmation screen. It replaces toolbar pills with a clear heading, a plain duration summary, and one bottom primary action.
- Desktop is a wide main scenario board plus a compact right readiness rail; mobile stacks the same reading order without hiding context.
- Main board uses numbered role facts and three objective rows; verbose time/location/background context is omitted. The side rail uses the existing Reicon semantic icons for AI counterpart and device readiness; no new icon set or generated icon asset is introduced.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | `120ms` | ease-out | Button press |
| Standard | `240ms` | ease-in-out | Menu, tabs |
| Emphasis | `520ms` | cubic-bezier(0.16, 1, 0.3, 1) | Section reveal |
| Scroll | scroll-linked | linear | Sticky/parallax benefit sections |

Only animate `transform`, `opacity`, and `filter`. Respect `prefers-reduced-motion`.

## 7. Depth & Surface

Strategy: mixed restrained depth.

Cards use soft blue-gray shadows and thin borders. Liquid panels use translucent white, blur, and inner highlight. Dark camera surfaces use contrast and guide overlays instead of heavy decoration.

## 8. Accessibility, Personas & Accepted Debt

- Primary kiosk visitor: an employee who needs quick, low-stress practice; success means they can understand the current step, make one selection, and continue without decoding system jargon.
- Keyboard users can tab through every selection card and receive a visible selected/focus state. Generated portraits and medallions are decorative so their text alternative stays on the card title and description.
- The stepper communicates progress with text as well as color. Motion is limited to the existing opacity/transform page transition and respects `prefers-reduced-motion`.
- Accepted debt: the generated role portraits are representative illustrations, not a live character identity. The real local PoC character name and role remain the source of truth when the practice session begins.

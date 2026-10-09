# Workplace mirror simulation · 2026-10-08

## Implementation
- Mirror + workplace rendering is now part of the existing PracticePage. TTS, transcription/autosubmit, audio capture, nonverbal tracking, server submit and App result routing remain the existing flow.
- Scene background uses session.interaction.briefing.category_id; no independent 18-second scene simulation.
- Only filmed character and glass dialogue card remain. Progress bar, brand, heading, location and scenario summary metadata removed from simulation. Overview remains unchanged.
- Background-only blur is .45 viewport units (17.28px at 4K); slight overscan clipped by environment layer.
- Entry briefing appears within the dialogue card and uses the existing 12-second automatic reading period. Required microphone calibration is retained before conversation.
- Card displays current composeTurnSpeech output and in-card input status/errors. Voice input is automatic; text fallback stays inside card when microphone is unavailable.
- Existing video registry and reaction states retained. Analysis camera/canvas stay mounted but visually hidden.

## Verification
- Build passed. Targeted frontend tests: 13 passed. Workplace backend tests: 31 passed.
- Browser with real server session in isolated QA DB: first question rendered; synthetic typed answer submitted through PracticePage submitDraft→submitResponse; new server question received; answer input cleared. No camera/microphone requested for this QA harness.
- Browser: one dialogue card, no header or day progress; client/scroll dimensions equal; all three image backgrounds load; filmed video readyState 4 and playing.
- Full frontend suite attempted, then stopped after navigation browser test failed; not claimed as passing.
- Physical NFC, microphone calibration and hands-free voice-to-result flow need hardware validation. Existing process retained, not fully exercised in this environment.
- Preview ?scene=work is a fixed visual snapshot. Default simulation/4k.html embeds the actual mirror application and requires normal card/consent/media preparation.

- Temporary QA harness removed and isolated QA backend stopped after verification.
- External review (earlier version, before header removal): https://www.lazyweb.com/report/lazyweb/eb210a16-2753-4493-92af-a2d5076d2476/?source=create

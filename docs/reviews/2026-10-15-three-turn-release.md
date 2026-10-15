# Smart mirror: three-turn consumer scenario

## Behavior

The actual `?service=workplace&mirror=1` client sends `exhibition: true`. Its backend plan now contains three user-answer slots, not five. After the third answer, the API returns `finished: true` without a next turn; the existing client enters analysis/results. There is one prepared opening and two generated follow-ups. Previously created sessions retain their saved plans: start a new experience after updating.

Only the personal-consumption scene (order 15) is enabled. The other three exhibition scenes remain in source but cannot be randomly selected or forced through fixed_order. Review previews use the enabled scene and its current opening line. Unrelated interview/cafe scenario packs are unchanged.

The actor persona uses mixed polite/casual Korean, avoids compulsory follow-up questions and respects refusal without asking for amounts, reasons or spending plans. Real OpenAI text tests were authorized by the owner and used synthetic answers. Three final flows showed no renewed information demand after refusal; mixed speech appeared in two flows, while immediate refusal produced mostly polite speech. Repeated wording remains a limitation; model behavior is not guaranteed.

Settings loading accepts unrelated entries in a shared .env so the local launcher option does not prevent startup. Recognized settings still validate their types; no credentials or environment values are changed or committed.

## Verification

- Actual running server, synthetic answers: answers 1/2 returned finished=false with a next turn; answer 3 returned finished=true and no next turn. This checks the same session-response API used by the mirror, not just an isolated prompt call.
- Clean committed base with only the selected release files overlaid: test_workplace_exhibition.py, test_fixed_workplace_scene.py, test_settings_shared_env.py — 15 passed.
- Frontend production build passed after the three-turn change; existing large-bundle warning remains.
- git diff --check passed.
- No camera/microphone/TTS end-to-end or physical NFC test is claimed.

Scope excludes the pre-existing local dashboard/report/scoring/expression changes, generated output, local test logs, secrets, databases and model files.

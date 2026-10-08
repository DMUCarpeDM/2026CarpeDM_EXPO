# Session overview linking

- Product prepares the consented NFC session before starting the 43-second overview. The same prepared session is reused when practice starts.
- Public interaction overview returns the first selected scene per category; only display fields are exposed, not evaluation keywords or fallback pools.
- Cards derive character name, title, situation, time, opening and goal from the session. Missing overview blocks the clock rather than showing invented examples.
- Preparation is scoped to route/card issuance/consent revision; stale results cannot replace another visitor's prepared session.
- Review harness imports the canonical scenario pack and shows the first scene in each category without creating a session or requesting media. It is a catalog preview, not a live NFC session.
- Backend workplace and API integration tests: 31 passed. Creation opening matches overview; overview stays stable across resumed sessions and all 12 turns.
- Frontend overview/timeline tests: 5 passed. Production build passed.
- Browser 2160×3840: work card shows 이팀장 / 이거 오늘까지 알아서 해봐요 / 10:05; leaving card shows 최동료 / 팀장님 아직 계시는데 벌써 가요? / 18:05. No card or page overflow.
- Browser screenshots: workspace output/mirror-overview/work-4k.png and leaving-4k.png.
- Backend and frontend must both be deployed for live session overview support. Physical NFC/media-device end-to-end testing was not performed.

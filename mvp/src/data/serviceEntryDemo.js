// Local fixtures keep the exhibition's direct demo routes usable without a backend.
export const DEMO_REPORT = {
  session_id: "d6",
  total_score: 88, percentile_top: 18, mode: 5, difficulty: "pressure",
  finished_label: "2024.05.24 14:32", character_name: "팀장 김민수", scenario_title: "서버 장애 보고",
  fit_scores: {
    "Response-Fit": { score: 86, summary: "핵심부터 말해 전달이 또렷했어요." },
    "Voice-Fit": { score: 82, summary: "안정적인 속도로 말했어요." },
    "Expression-Fit": { score: 84, summary: "상황에 맞게 표정으로 잘 반응했어요.", provisional: true, note: "표정 점수는 아직 검증 중인 참고 지표예요 (α 검증 전)." },
    "Posture-Fit": { score: 91, summary: "끝까지 바른 자세를 유지했어요." },
  },
  strengths: [
    "결론을 먼저 말하고 근거를 덧붙이는 흐름이 좋았어요.",
    "장애 영향 범위를 숫자로 구체화해 신뢰를 줬어요.",
    "다음 대응 계획과 기한을 분명히 전달했어요.",
    "끝까지 차분한 목소리를 유지했어요.",
    "상대의 추가 질문에도 당황하지 않고 답했어요.",
  ],
  improvements: [
    "첫 문장에서 핵심 결론을 조금 더 앞세워 보세요.",
    "불확실한 부분은 '확인 후 공유'로 명확히 구분해 보세요.",
    "중요한 수치는 한 번 더 강조해 보세요.",
    "말끝을 흐리지 않고 문장을 끝맺어 보세요.",
  ],
  headline: { sentence: "결론을 먼저, 근거는 한 문장으로 요약하면 설득력이 더 올라가요." },
  previous: { total_score: 72, started_at: "2024-05-20", fit_scores: { "Response-Fit": 72, "Voice-Fit": 68, "Expression-Fit": 78, "Posture-Fit": 82 } },
  speech_stats: {
    turns: 5, total_syllables: 412, avg_speech_rate: 4.9, formal_pct: 88, measurement: { level: "표준", frames: 512, audio_sec: 163.2 },
    paralinguistics: { speech_rate_spm: 294, speech_rate_note: "적정 속도", lead_in_mean_sec: 0.8, long_pause_total: 2, filler_count: 3, filler_top: [["음", 2], ["어", 1]] },
  },
  grade: "우수",
  claim_url: "http://127.0.0.1:8001/claim?token=demo-claim-token",
  coaching: [{
    turn_order: 2,
    quote: "아마도 다음 주쯤에는 될 것 같은데요, 한번 확인해보고 말씀드릴게요.",
    issue: "모호한 일정 표현 — 듣는 사람이 계획을 세울 수 없어요.",
    suggestion: "프론트엔드 구현은 다음 주 수요일까지 완료 가능합니다. 미확정인 API 일정은 오늘 4시까지 확인해 다시 보고드리겠습니다.",
    manual_ref: null,
  }],
  deep_analysis: {
    delivery: {
      title: "말의 구조",
      rows: [
        { label: "결론 선행", value: "5번 중 4번" },
        { label: "기한 있는 약속", value: "3회" },
        { label: "책임 문형(제가 ~하겠습니다)", value: "4회" },
        { label: "모호어 밀도", value: "100음절당 0.4회" },
        { label: "구체성(숫자·수치)", value: "6회" },
        { label: "질문 정합성", value: "82%" },
      ],
      comment: "결론을 먼저 말하고 숫자로 받치는 구조가 안정적이에요. 모호어가 거의 없어 신뢰가 쌓입니다.",
      confidence: { level: "확실", n: 5 },
    },
    congruence: {
      title: "말-목소리 일치도",
      level: "언행일치",
      rows: [
        { label: "모호어 밀도(말)", value: "100음절당 0.4회" },
        { label: "목소리 떨림(jitter)", value: "0.6%" },
        { label: "문장 중간 끊김", value: "평균 0.3회" },
      ],
      comment: "내용도 단정적이고 목소리도 안정적이었어요. 내용과 전달의 확신이 같은 방향인 사람은 드뭅니다.",
      confidence: { level: "확실", n: 5 },
    },
    adaptation: {
      title: "적응 곡선",
      trend: "up",
      points: [
        { turn_order: 1, score: 74.2 }, { turn_order: 2, score: 79.5 }, { turn_order: 3, score: 84.1 },
        { turn_order: 4, score: 88.6 }, { turn_order: 5, score: 91.3 },
      ],
      comment: "후반으로 갈수록 점수가 17점 올랐어요. 압박 질문에 적응하며 안정을 찾는 전형적인 상승 곡선이에요.",
      confidence: { level: "확실", n: 5 },
    },
    moments: [
      { turn_order: 2, at_sec: 14, kinds: ["hesitation"], description: "답변 14초 지점: 일정 질문에 잠시 머뭇거렸지만 곧 구체적인 날짜로 회복했어요", quote: "아마도 다음 주쯤…" },
    ],
  },
  day_ending: { level: "high", label: "신뢰", character_id: "c1", text: "오늘 보고 덕분에 고객사 대응 방향이 잡혔어요. 이렇게 정리해서 와주면 나야 든든하죠. 내일 회의도 부탁해요." },
  rebuild: {
    turn_order: 2,
    episode_title: "업무 보고 및 피드백 논의",
    quote: "아마도 다음 주쯤에는 될 것 같은데요, 한번 확인해보고 말씀드릴게요.",
    items: [
      { label: "결론 우선 (현재 상태부터)", sentence: "결론부터 말씀드리면, 프론트엔드 구현은 다음 주 수요일까지 완료 가능합니다." },
      { label: "기한 명시 (확인 약속)", sentence: "미확정인 API 연동 일정은 오늘 오후 팀 확인 후 4시까지 다시 보고드리겠습니다." },
    ],
  },
  evidence_segments: [
    { turn_id: 1, fit_type: "eye", observed: "정면 응시 87%, 이탈 2회, 최장 이탈 1.2초 — 안정적이었어요", interpretation: "말의 신뢰도를 시선이 받쳐주고 있었어요.", suggestion: "다음 단계 도전: 핵심 문장에서 시선을 고정해 보세요." },
    { turn_id: 2, fit_type: "response", observed: "결론 선행 4/5회, 질문 정합성 82%", interpretation: "질문의 핵심 단어를 받아 말하는 습관이 자리 잡혔어요.", suggestion: "모호한 일정 표현('아마도')만 확인 약속으로 바꿔보세요." },
  ],
};

export const DEMO_HISTORY = [
  { session_id: "d1", total_score: 61, started_at: "2024-04-20" },
  { session_id: "d2", total_score: 66, started_at: "2024-04-27" },
  { session_id: "d3", total_score: 71, started_at: "2024-05-04" },
  { session_id: "d4", total_score: 76, started_at: "2024-05-11" },
  { session_id: "d5", total_score: 72, started_at: "2024-05-20", fit_scores: { "Response-Fit": 72, "Voice-Fit": 68, "Expression-Fit": 78, "Posture-Fit": 82 } },
  { session_id: "d6", total_score: 88, started_at: "2024-05-24", fit_scores: { "Response-Fit": 86, "Voice-Fit": 82, "Expression-Fit": 84, "Posture-Fit": 91 } },
];

export const DEMO_SESSION = { id: "demo", mode: 5, scenario: { title: "업무 보고 및 피드백 논의", description: "김서윤 팀장에게 프로젝트 중간 진행 상황을 보고하는 자리예요. 팀장은 바쁘고 직설적이라 결론부터 듣고 싶어 해요. 진행률과 지연 사유, 다음 계획을 준비해 보세요.", characters: [{ id: "kim_teamlead", name: "김서윤 팀장", role: "상사", personality: "직설적이고 바쁘다. 결론부터 듣고 싶어 한다." }] } };
export const DEMO_TURN = { id: "t2", order: 2, character_id: "c1", asked_at: "02:35", question_text: "흠, 70%라면 일정보다 살짝 늦는 것 같은데요. 구체적으로 어떤 부분이 지연되고 있나요?" };
export const DEMO_TURN_SIGNALS = { case: "covered", coverage: 0.72, emotion: { state: "displeased", label: "불만", temperature: 48, eased: true } };
export const DEMO_TURN_HISTORY = [
  { id: "t1", order: 1, character_id: "c1", asked_at: "02:31", answered_at: "02:34", question_text: "이번 프로젝트 진행 상황을 간단히 요약해주시고, 현재 가장 어려운 부분은 무엇인지 설명해 주세요.", response_text: "현재 디자인 시스템은 거의 마무리 단계이고, 프론트엔드 구현도 70% 정도 완료되었습니다..." },
];

const SESSION_KEY = "mirror-ting-static-interview-session";
const HISTORY_KEY = "mirror-ting-static-interview-history";

const ROLE_CATALOG = {
  fullstack: {
    title: "풀스택 개발자",
    brief: "웹 서비스를 만드는 가상 회사의 신입 풀스택 개발자 면접입니다.",
    questions: [
      "자기소개를 해 주세요.",
      "우리 회사의 풀스택 개발자 직무에 지원한 이유는 무엇인가요?",
      "다른 사람과 함께한 활동에서 어떤 역할을 했나요?",
      "프론트엔드와 백엔드는 각각 어떤 역할을 하나요?",
      "사용자가 로그인 버튼을 누르면 서버와 어떤 과정을 거쳐 로그인되나요?",
      "입사하면 어떤 업무를 배우거나 해 보고 싶나요?",
    ],
  },
  marketing: {
    title: "마케팅",
    brief: "생활용품을 온라인으로 판매하는 가상 회사의 신입 마케팅 면접입니다.",
    questions: [
      "자기소개를 해 주세요.",
      "우리 회사의 마케팅 직무에 지원한 이유는 무엇인가요?",
      "본인의 강점과 이를 보여 주는 평소 행동을 알려 주세요.",
      "새 상품을 홍보할 때 대상 고객과 홍보 채널을 어떻게 정하나요?",
      "홍보가 효과 있었는지 무엇을 보고 판단하나요?",
      "입사하면 어떤 업무를 배우거나 해 보고 싶나요?",
    ],
  },
  sales: {
    title: "영업관리 / 세일즈",
    brief: "기업 고객에게 업무용 서비스를 제공하는 가상 회사의 신입 세일즈 면접입니다.",
    questions: [
      "자기소개를 해 주세요.",
      "우리 회사의 세일즈 직무에 지원한 이유는 무엇인가요?",
      "본인의 약점과 보완 방법을 알려 주세요.",
      "처음 만난 고객에게 상품을 제안하기 전에 무엇을 확인하나요?",
      "고객이 가격이 비싸다고 하면 어떻게 대응하나요?",
      "입사하면 어떤 업무를 배우거나 해 보고 싶나요?",
    ],
  },
};

export const STATIC_INTERVIEW_SCENARIOS = Object.entries(ROLE_CATALOG).map(([role, catalog], index) => ({
  slug: `interview-${role}`,
  title: `신입 ${catalog.title} 일반면접`,
  description: catalog.brief,
  job_role: role,
  domain: "interview",
  world_setting: { service_modes: ["interview"] },
  characters: [{ id: "interviewer", name: "AI 면접관", role: "면접관" }],
  episodes: [{
    id: 1001 + index,
    order: 1,
    title: `일반면접 · ${catalog.questions.length}개 질문`,
    character_id: "interviewer",
    initial_question: catalog.questions[0],
    situation: catalog.brief,
    modes: [5],
  }],
  interview_questions: catalog.questions,
}));

function parseBody(options) {
  if (!options?.body || typeof options.body !== "string") return {};
  try { return JSON.parse(options.body); } catch { return {}; }
}

function turnFor(session, index) {
  const question = session.scenario.interview_questions[index];
  if (!question) return null;
  return {
    id: `local-turn-${index + 1}`,
    order: index + 1,
    character_id: "interviewer",
    asked_at: new Date().toISOString(),
    question_text: question,
  };
}

function reportFor(session) {
  const answers = session.history || [];
  const lengths = answers.map((item) => item.response_text.trim().length);
  const averageLength = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
  const responseScore = Math.max(62, Math.min(92, Math.round(64 + averageLength / 8)));
  const nonverbal = answers.map((item) => item.nonverbal).filter(Boolean);
  const postureScore = nonverbal.length ? 84 : 78;
  const expressionScore = nonverbal.length ? 82 : 76;
  const voiceScore = answers.some((item) => item.stt_source === "webspeech") ? 84 : 79;
  const total = Math.round((responseScore + postureScore + expressionScore + voiceScore) / 4);
  const weakest = answers.reduce((result, item) => item.response_text.length < result.response_text.length ? item : result, answers[0] || { response_text: "" });
  const quote = weakest?.response_text || "답변 내용을 조금 더 구체적으로 설명하겠습니다.";
  const suggestion = `${quote.replace(/[.。!?]?$/, "")} 또한 제가 맡은 행동과 배운 점을 한 문장으로 덧붙이겠습니다.`;
  return {
    session_id: session.id,
    total_score: total,
    percentile_top: Math.max(12, 42 - Math.round((total - 70) * 1.4)),
    mode: 5,
    difficulty: "basic",
    finished_label: new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }),
    character_name: "AI 면접관",
    scenario_title: session.scenario.title,
    grade: total >= 85 ? "우수" : total >= 70 ? "좋아요" : "연습이 필요해요",
    fit_scores: {
      "Response-Fit": { score: responseScore, summary: "질문과 연결되는 핵심 표현을 확인했어요." },
      "Voice-Fit": { score: voiceScore, summary: "브라우저 음성 인식 결과를 바탕으로 전달 흐름을 확인했어요." },
      "Expression-Fit": { score: expressionScore, summary: "카메라에서 관찰한 표정 변화를 참고했어요.", provisional: true },
      "Posture-Fit": { score: postureScore, summary: "카메라에서 관찰한 자세 안정도를 참고했어요." },
    },
    strengths: [
      "질문을 끝까지 듣고 답변을 완성했어요.",
      "자신의 경험을 직무와 연결하려는 흐름이 좋았어요.",
      "면접 전 과정에서 차분한 태도를 유지했어요.",
    ],
    improvements: [
      "첫 문장에서 결론을 먼저 말해 보세요.",
      "경험을 말할 때 본인이 한 행동을 구체적으로 덧붙여 보세요.",
      "답변 마지막에 직무와 연결되는 배운 점을 정리해 보세요.",
    ],
    headline: { sentence: "결론, 행동, 배운 점의 순서로 답하면 더 분명하게 전달할 수 있어요." },
    speech_stats: {
      turns: answers.length,
      formal_pct: 86,
      measurement: { frames: nonverbal.length * 90 },
      paralinguistics: { speech_rate_note: "안정적", filler_count: 0 },
    },
    coaching: [{
      turn_order: weakest?.order || 1,
      quote,
      issue: "구체적인 행동과 배운 점을 한 문장 더 보완해 보세요.",
      suggestion,
    }],
    evidence_segments: [{
      turn_id: weakest?.id || "local-turn-1",
      fit_type: "response",
      observed: `${answers.length}개 답변의 길이와 질문 관련 표현, 브라우저에서 측정한 비언어 신호를 함께 살펴봤어요.`,
      interpretation: "핵심을 먼저 말하면 답변의 설득력이 더 높아져요.",
      suggestion: "결론 뒤에 본인의 행동과 배운 점을 덧붙여 보세요.",
    }],
  };
}

export function createStaticInterviewApi(storage) {
  const read = (key, fallback) => {
    try { return JSON.parse(storage.getItem(key) || "null") || fallback; } catch { return fallback; }
  };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));
  const loadSession = () => read(SESSION_KEY, null);
  const saveSession = (session) => { write(SESSION_KEY, session); return session; };

  return async function staticRequest(path, options = {}) {
    const method = options.method || "GET";
    if (path === "/scenarios") return STATIC_INTERVIEW_SCENARIOS;
    if (path === "/health") return { dialogue_ready: true, dialogue_provider: "browser", tts_ready: false };
    if (path === "/sessions" && method === "POST") {
      const body = parseBody(options);
      const scenario = STATIC_INTERVIEW_SCENARIOS.find((item) => item.slug === body.scenario_slug) || STATIC_INTERVIEW_SCENARIOS[0];
      const session = {
        id: `local-${Date.now()}`,
        access_token: "browser-local-session",
        status: "in_progress",
        mode: 5,
        difficulty: "basic",
        selected_episode_id: body.selected_episode_id || scenario.episodes[0].id,
        scenario,
        history: [],
        interaction: { mode: "interview", index: 0, total: scenario.interview_questions.length },
      };
      session.current_turn = turnFor(session, 0);
      return saveSession(session);
    }
    if (/^\/sessions\/[^/]+$/.test(path)) return loadSession();
    if (/\/turns\/[^/]+\/audio$/.test(path)) return { accepted: true };
    if (/\/turns\/[^/]+\/response$/.test(path) && method === "POST") {
      const session = loadSession();
      if (!session) throw new Error("브라우저 면접 세션을 찾을 수 없어요.");
      const body = parseBody(options);
      session.history.push({
        ...session.current_turn,
        answered_at: new Date().toISOString(),
        response_text: body.text || "",
        stt_source: body.stt_source || "text",
        duration_ms: body.duration_ms || 0,
        nonverbal: body.nonverbal || null,
      });
      const nextIndex = session.history.length;
      const nextTurn = turnFor(session, nextIndex);
      session.current_turn = nextTurn;
      session.interaction = { ...session.interaction, index: nextIndex };
      if (!nextTurn) session.status = "analyzing";
      saveSession(session);
      return {
        finished: !nextTurn,
        next_turn: nextTurn,
        interaction: session.interaction,
        turn_signals: { case: body.text?.trim().length >= 35 ? "covered" : "partial", coverage: Math.min(1, (body.text?.trim().length || 0) / 70) },
      };
    }
    if (/\/finish$/.test(path) && method === "POST") {
      const session = loadSession();
      if (session) { session.status = "completed"; saveSession(session); }
      return { status: "completed" };
    }
    if (/\/progress$/.test(path)) return { status: "completed", stage: "done", pct: 100 };
    if (/\/report$/.test(path)) {
      const session = loadSession();
      const report = reportFor(session);
      const history = read(HISTORY_KEY, []).filter((item) => item.session_id !== report.session_id);
      history.push({ session_id: report.session_id, total_score: report.total_score, started_at: new Date().toISOString(), fit_scores: report.fit_scores });
      write(HISTORY_KEY, history.slice(-6));
      return report;
    }
    if (path.startsWith("/history")) return { items: read(HISTORY_KEY, []) };
    if (path === "/codes" && method === "POST") return { code: "BROWSER-DEMO", expires_in: 600 };
    throw new Error(`지원하지 않는 브라우저 데모 요청입니다: ${method} ${path}`);
  };
}

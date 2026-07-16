// 분석 서버(/api/health) 응답을 상단 네비 상태 칩이 쓸 표현으로 요약해요.
// tone: ok(정상) | degraded(성능 저하) | down(미연결)

const REASON_LABELS = {
  ollama_unreachable: "대화 개인화(Ollama) 미연결",
  dialogue_model_missing: "대화 모델 미설치",
  embedding_model_missing: "의미 매칭 모델 미설치",
  semantic_match_disabled: "의미 매칭 비활성",
  whisper_unavailable: "음성 인식(whisper) 미설치",
  db_unavailable: "기록 저장소 오류",
};

export function describeHealth(health) {
  if (!health || health.ok !== true) {
    return {
      tone: "down",
      label: "분석 서버 미연결",
      detail: "poc/backend 분석 서버를 실행하면 연습을 시작할 수 있어요. (scripts/expo_start.sh)",
    };
  }
  if (health.degraded) {
    const reasons = (health.degraded_reasons || []).map((reason) => REASON_LABELS[reason] || reason);
    return {
      tone: "degraded",
      label: "분석 서버 일부 기능 제한",
      detail: reasons.length ? reasons.join(" · ") : "일부 AI 기능이 폴백 모드로 동작해요.",
    };
  }
  const stt = health.server_stt ? `STT ${health.server_stt}` : null;
  const dialogue = health.dialogue_provider ? `대화 ${health.dialogue_provider}` : null;
  return {
    tone: "ok",
    label: "분석 서버 연결됨",
    detail: [stt, dialogue].filter(Boolean).join(" · ") || "모든 분석 기능이 준비됐어요.",
  };
}

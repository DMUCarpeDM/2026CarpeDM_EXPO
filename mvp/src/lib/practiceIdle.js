// 연습 화면 방치 판정 — 마지막 "사람 신호"(터치·키보드·음성 인식 텍스트·얼굴 검출)
// 이후 경과 시간으로 3단계를 가른다. 리포트 흐름의 90초 유휴 리셋과 같은 관람객 격리
// 규칙이지만, 연습은 말없이 생각하는 시간이 정상 흐름이라 (1) 임계값이 훨씬 길고
// (2) 얼굴이 카메라에 보이는 동안은 호출부가 사람 신호를 계속 밀어 넣어 절대 리셋되지
// 않으며 (3) 복귀 전 확인 오버레이 단계를 거친다.
export const PRACTICE_IDLE_WARN_MS = 150_000; // 2분 30초 무신호 → "아직 연습 중이신가요?"
export const PRACTICE_IDLE_GRACE_MS = 20_000; // 오버레이 후 20초 더 무반응 → 홈 복귀

export function practiceIdlePhase(idleMs, { warnMs = PRACTICE_IDLE_WARN_MS, graceMs = PRACTICE_IDLE_GRACE_MS } = {}) {
  if (!Number.isFinite(idleMs) || idleMs < 0) return "active";
  if (idleMs >= warnMs + graceMs) return "reset";
  if (idleMs >= warnMs) return "warn";
  return "active";
}

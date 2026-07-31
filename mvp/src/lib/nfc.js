// NFC 카드 흐름 공용 순수 로직 (S-B2B-103~106) — 발급 키오스크·미러가 함께 쓴다.
// 백엔드 계약(poc/backend app/api/nfc.py):
//   GET  /api/nfc/tap?reader=kiosk|mirror&since=N → {seq, uid, reader, at} (새 태그 없으면 uid: "")
//   POST /api/nfc/issue {uid, job_role, scenario_slug?} → 카드 정보 (알 수 없는 직무 422)
//   POST /api/nfc/resolve {uid} → {uid, job_role, scenario_slug, job_role_label} (미등록·폐기 404)

// 직무 카탈로그 — 발급 키오스크 3버튼과 미러 수동 폴백 3버튼의 단일 소스.
// id·scenarioSlug는 백엔드 DEFAULT_PACK_BY_ROLE(app/api/nfc.py)과 반드시 일치해야 한다.
export const JOB_ROLES = [
  {
    id: "cafe_crew",
    label: "카페 매장 크루",
    scenarioSlug: "ondo-cafe-crew",
    text: "카운터 응대와 컴플레인 대응을 연습해요",
    brand: "cafe-ondo",
    counterpartProfileId: "partner",
  },
  {
    id: "cs_agent",
    label: "고객센터 상담",
    scenarioSlug: "ondo-cs-agent",
    text: "환불·배달 지연 비대면 응대를 연습해요",
    brand: "cafe-ondo",
    counterpartProfileId: "partner",
  },
  {
    id: "office_admin",
    label: "사무행정 신입",
    scenarioSlug: "release-schedule-alignment",
    text: "일정 조율과 결론 우선 보고를 연습해요",
    brand: "cloudmeet",
    counterpartProfileId: "manager",
  },
];

export function findJobRole(jobRoleId) {
  return JOB_ROLES.find((role) => role.id === jobRoleId) || null;
}

export function scenarioSlugForJobRole(jobRoleId) {
  return findJobRole(jobRoleId)?.scenarioSlug || "";
}

export function jobRoleLabel(jobRoleId) {
  return findJobRole(jobRoleId)?.label || jobRoleId || "";
}

// 폴링 커서 전진 — tap 응답이 "새 태그"인지 판정하고 다음 since를 계산한다.
// uid가 비면 새 태그 없음(커서 유지), seq가 커서 이하면 중복·과거 이벤트라 무시한다.
export function advanceTapCursor(since, tap) {
  if (!tap || !tap.uid || !(Number(tap.seq) > since)) return { since, tap: null };
  return { since: Number(tap.seq), tap };
}

// 운영자 수동 UID 입력 검증 — 백엔드 NfcIssueIn 패턴(^[0-9A-Fa-f:\-]+$, 4~32자)과 동일 규칙.
export function isValidUid(raw) {
  const uid = String(raw || "").trim();
  return uid.length >= 4 && uid.length <= 32 && /^[0-9A-Fa-f:-]+$/.test(uid);
}

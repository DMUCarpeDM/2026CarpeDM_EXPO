import teamLeadPortrait from "../../assets/team-lead-video-portrait.png";

// 인물 얼굴 공용 컴포넌트 — 실사 초상 자산은 김서윤 팀장 촬영분뿐이다.
// 그 외 인물(팩 고객·선배·점장, 그리고 '나')은 이니셜 아바타로 그린다:
// 고객 대사 옆에 정장 팀장 사진이 붙던 부자연(플레이 실측)의 일괄 수정.
// 캐릭터별 실사 촬영분이 준비되면 여기 매핑만 추가하면 전 화면에 반영된다.
const TEAM_LEAD_NAME = "김서윤";

export function PersonaFace({ name = "" }) {
  if (!name || name.includes(TEAM_LEAD_NAME)) {
    return <img src={teamLeadPortrait} alt="" />;
  }
  return <b className="persona-initial" aria-hidden="true">{name.replace(/^\s+/, "").slice(0, 1)}</b>;
}

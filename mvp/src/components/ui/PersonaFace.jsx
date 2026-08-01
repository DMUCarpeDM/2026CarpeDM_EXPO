import { DEFAULT_PORTRAIT_CHARACTER_ID, mediaById, mediaByName } from "../../data/characterMedia";

// 인물 얼굴 공용 컴포넌트 — 실사 초상은 data/characterMedia.js 등록부에서 찾는다.
// 등록이 없는 인물(팩 고객·선배·점장, 그리고 '나')은 이니셜 아바타로 그린다:
// 고객 대사 옆에 정장 팀장 사진이 붙던 부자연(플레이 실측)의 일괄 수정.
// 새 인물 촬영분이 준비되면 등록부에만 추가하면 이 컴포넌트를 쓰는 전 화면에 반영된다.
//
// characterId를 아는 화면은 그것으로, 대화 로그·결말처럼 이름만 아는 화면은 name으로 찾는다.
export function PersonaFace({ name = "", characterId = "" }) {
  // 이름·id가 둘 다 없는 자리는 기본 인물 초상으로 채운다(기존 동작 보존).
  // 실제로 여기 오는 건 리포트의 '하루의 결말' 카드다 — 백엔드 ReportOut에
  // character_name이 없어 항상 빈 문자열이 온다. 빈 원을 띄우지 않기 위한 기본값이며,
  // 결말 화자가 팀장이 아닌 회차에서는 인물이 어긋난다(기존부터 있던 한계).
  const media = mediaById(characterId) || mediaByName(name)
    || (!name && !characterId ? mediaById(DEFAULT_PORTRAIT_CHARACTER_ID) : null);
  if (media?.portrait) {
    return <img src={media.portrait} alt="" />;
  }
  return <b className="persona-initial" aria-hidden="true">{name.replace(/^\s+/, "").slice(0, 1)}</b>;
}

import teamLeadPortrait from "../assets/team-lead-video-portrait.png";
import teamLeadListening from "../assets/team-lead-videos/team-lead-listening.mp4";
import teamLeadNegative from "../assets/team-lead-videos/team-lead-negative.mp4";
import teamLeadPositive from "../assets/team-lead-videos/team-lead-positive.mp4";
import teamLeadSpeaking from "../assets/team-lead-videos/team-lead-speaking.mp4";

/** 캐릭터별 실사 자산 등록부 — 촬영분이 준비되면 **이 파일 한 곳만** 고치면
 *  연습 화면 영상(CounterpartVideo)과 전 화면 초상(PersonaFace)에 동시에 반영된다.
 *
 *  키는 시드의 `character_id`(예: kim_teamlead). 이름만 아는 화면(대화 로그·AI 질문·
 *  하루의 결말)이 있어서 `name`도 함께 둔다 — byName이 이 값으로 찾는다.
 *
 *  등록 규칙:
 *  - `videos`는 speaking/listening/positive/negative **4종을 모두 갖췄을 때만** 넣는다.
 *    일부만 넣으면 상태 전환에서 끊긴 클립으로 되돌아가 부자연스럽다.
 *  - `portrait`만 있어도 된다. 그 경우 연습 화면은 이름 카드(CounterpartAvatar)를 쓰고
 *    초상이 필요한 자리에는 사진이 나간다.
 *  - 아무것도 없는 인물은 이니셜 아바타로 그린다 — 고객 대사 옆에 팀장 사진이 붙던
 *    부자연(2026-07-31 플레이 실측)을 막기 위한 기본값이다.
 *
 *  규격(팀장 촬영분 기준): 영상 1280×720 · 10초 · 무음 · 자연 루프 · 약 2.5MB,
 *  초상 1280×720. 새 인물도 같은 배경·조명·프레이밍으로 찍어야 전환 시 튀지 않는다.
 */
export const CHARACTER_MEDIA = {
  kim_teamlead: {
    name: "김서윤",
    portrait: teamLeadPortrait,
    videos: {
      speaking: teamLeadSpeaking,
      listening: teamLeadListening,
      positive: teamLeadPositive,
      negative: teamLeadNegative,
    },
  },
};

/** 이름·id가 모두 없는 자리(리포트 '하루의 결말' 카드)에 쓰는 기본 초상.
 *  백엔드 ReportOut에 character_name이 없어 그 자리는 항상 빈 값이 온다 — 빈 원 대신
 *  대표 인물을 세우는 기존 동작을 유지하기 위한 값이다. */
export const DEFAULT_PORTRAIT_CHARACTER_ID = "kim_teamlead";

/** character_id로 자산 조회 */
export function mediaById(characterId) {
  return (characterId && CHARACTER_MEDIA[characterId]) || null;
}

/** 이름으로 자산 조회 — id를 모르는 화면용.
 *  시드 이름이 "김서윤 팀장"처럼 직함을 달고 오므로 부분 일치로 찾는다. */
export function mediaByName(name) {
  if (!name) return null;
  const entry = Object.values(CHARACTER_MEDIA).find((m) => m.name && name.includes(m.name));
  return entry || null;
}

/** 이 인물의 반응 영상 4종이 준비돼 있는가 — 연습 화면이 영상/이름카드를 고르는 기준 */
export function hasCharacterVideo(characterId) {
  return Boolean(mediaById(characterId)?.videos);
}

import teamLeadPortrait from "../assets/team-lead-video-portrait.png";
import teamLeadListening from "../assets/team-lead-videos/team-lead-listening.mp4";
import teamLeadNegative from "../assets/team-lead-videos/team-lead-negative.mp4";
import teamLeadPositive from "../assets/team-lead-videos/team-lead-positive.mp4";
import teamLeadSpeaking from "../assets/team-lead-videos/team-lead-speaking.mp4";
import cafeComplaintListening from "../assets/team-lead-videos/team-lead-complaint-listening.mp4";
import cafeComplaintReaction from "../assets/team-lead-videos/team-lead-complaint-reaction.mp4";
import cafeListening from "../assets/team-lead-videos/team-lead-listening-smile.mp4";
import cafeSpeaking from "../assets/team-lead-videos/team-lead-speaking-smile.mp4";
import morningSpeakingBase from "../assets/workplace-videos/morning/speaking-base.mp4";
import morningJoy from "../assets/workplace-videos/morning/joy.mp4";
import morningDisappointment from "../assets/workplace-videos/morning/disappointment.mp4";
import morningIrritation from "../assets/workplace-videos/morning/irritation.mp4";
import morningAnger from "../assets/workplace-videos/morning/anger.mp4";
import morningListening from "../assets/workplace-videos/morning/listening.mp4";
import workSpeakingBase from "../assets/workplace-videos/work/speaking-base.mp4";
import workJoy from "../assets/workplace-videos/work/joy.mp4";
import workDisappointment from "../assets/workplace-videos/work/disappointment.mp4";
import workIrritation from "../assets/workplace-videos/work/irritation.mp4";
import workAnger from "../assets/workplace-videos/work/anger.mp4";
import workListening from "../assets/workplace-videos/work/listening.mp4";
import leavingSpeakingBase from "../assets/workplace-videos/leaving/speaking-base.mp4";
import leavingJoy from "../assets/workplace-videos/leaving/joy.mp4";
import leavingDisappointment from "../assets/workplace-videos/leaving/disappointment.mp4";
import leavingIrritation from "../assets/workplace-videos/leaving/irritation.mp4";
import leavingAnger from "../assets/workplace-videos/leaving/anger.mp4";
import leavingListening from "../assets/workplace-videos/leaving/listening.mp4";

/** 장소별 여성 전신 4K 영상: 기본 발화·감정 4종·듣기. 배경이 영상에 포함된다. */
const WORKPLACE_VIDEOS = Object.freeze({
  morning: Object.freeze({
    speaking: morningSpeakingBase,
    joy: morningJoy,
    disappointment: morningDisappointment,
    irritation: morningIrritation,
    anger: morningAnger,
    listening: morningListening,
  }),
  work: Object.freeze({
    speaking: workSpeakingBase,
    joy: workJoy,
    disappointment: workDisappointment,
    irritation: workIrritation,
    anger: workAnger,
    listening: workListening,
  }),
  leaving: Object.freeze({
    speaking: leavingSpeakingBase,
    joy: leavingJoy,
    disappointment: leavingDisappointment,
    irritation: leavingIrritation,
    anger: leavingAnger,
    listening: leavingListening,
  }),
});

const WORKPLACE_REACTION_STATES = Object.freeze(["joy", "disappointment", "irritation", "anger"]);

function workplaceMedia(name, category) {
  return {
    name,
    reactionStates: WORKPLACE_REACTION_STATES,
    videos: WORKPLACE_VIDEOS[category],
    videosByScene: WORKPLACE_VIDEOS,
  };
}

/** 캐릭터별 실사 자산 등록부 — 촬영분이 준비되면 **이 파일 한 곳만** 고치면
 *  연습 화면 영상(CounterpartVideo)과 전 화면 초상(PersonaFace)에 동시에 반영된다.
 *
 *  키는 시드의 `character_id`(예: kim_teamlead). 이름만 아는 화면(대화 로그·AI 질문·
 *  하루의 결말)이 있어서 `name`도 함께 둔다 — byName이 이 값으로 찾는다.
 *
 *  등록 규칙:
 *  - `videos`는 해당 인물이 사용하는 상태별 클립을 모두 갖췄을 때만 넣는다.
 *    상태 클립이 빠지면 listening으로 돌아가므로 전환이 부자연스러울 수 있다.
 *  - `portrait`만 있어도 된다. 초상이 필요한 자리에는 사진이 나간다.
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
  angry_customer: {
    name: "강선우",
    chromaKey: true,
    reactionStates: ["negative_reaction"],
    videos: {
      speaking: cafeSpeaking,
      listening: cafeListening,
      negative_reaction: cafeComplaintReaction,
      negative: cafeComplaintListening,
    },
  },
  // 직장대화 팩(workplace-conversation) — 기본말하기를 루프하고 감정 클립은 1회 재생 후 복귀
  park_senior: workplaceMedia("박선임", "morning"),
  lee_teamlead: workplaceMedia("이팀장", "work"),
  choi_coworker: workplaceMedia("최동료", "leaving"),
  yoon_partner: workplaceMedia("윤 담당", "work"),
};

/** 이름·id가 모두 없는 자리(리포트 '하루의 결말' 카드)에 쓰는 기본 초상.
 *  백엔드 ReportOut에 character_name이 없어 그 자리는 항상 빈 값이 온다 — 빈 원 대신
 *  대표 인물을 세우는 기존 동작을 유지하기 위한 값이다. */
export const DEFAULT_PORTRAIT_CHARACTER_ID = "kim_teamlead";

/** character_id로 자산 조회 */
export function mediaById(characterId, category) {
  const media = (characterId && CHARACTER_MEDIA[characterId]) || null;
  const videos = media?.videosByScene?.[category];
  return videos ? { ...media, videos } : media;
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

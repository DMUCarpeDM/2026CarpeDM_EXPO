import { AnimatePresence, motion } from "framer-motion";
import commute from "../assets/commute-v2.png";
import work from "../assets/work.png";
import departure from "../assets/departure-v2.png";
import idle from "../assets/participant-idle.png";
import walk from "../assets/participant-walk.png";
import senior from "../assets/senior.png";
import leader from "../assets/leader.png";
import colleague from "../assets/colleague.png";
import anonymousOne from "../assets/anonymous-1.png";
import anonymousTwo from "../assets/anonymous-2.png";
import anonymousThree from "../assets/anonymous-3.png";
import { workplacePreviewScenes } from "../data/workplacePreview";
import { pixelSceneState, anonymousSceneState, conversationSceneState, PIXEL_ACTOR_WIDTH } from "../lib/workplacePixelScene";

export const pixelOfficeScenes = [
  { background: commute, counterpart: senior, label: "출근 · 사무실 입구", name: "박선임", tone: "blue", deskLeft: 53, deskBottom: 30 },
  { background: work, counterpart: leader, label: "업무 · 협업 공간", name: "김팀장", tone: "purple", deskLeft: 62, deskBottom: 36 },
  { background: departure, counterpart: colleague, label: "퇴근 · 저녁 업무 공간", name: "이동료", tone: "green", deskLeft: 62, deskBottom: 36 },
];

export function WorkplacePixelOffice({ phase, reduced, blocked, visible }) {
  const index = Math.max(0, phase.scene);
  const scene = pixelOfficeScenes[index];
  const actor = pixelSceneState(phase, reduced, blocked, scene.deskLeft - 12);
  const conversation = conversationSceneState(phase, actor, scene.deskLeft, reduced, blocked);
  const replies = ["네, 내용과 기한을 확인할게요.", "완료한 일부터 말씀드릴게요.", "네, 남은 일과 다음 할 일을 정리했어요."];
  const speech = conversation.speaker === "counterpart" ? workplacePreviewScenes[index].line : replies[index];
  return <div className="mirror-office">
    <div className="mirror-pixel-stage" style={{"--mirror-actor-width": `${PIXEL_ACTOR_WIDTH}%`}} role="img" aria-label={`${scene.label}. 아이보리 옷이 참여자예요. ${scene.name}에게 말을 거는 장면이에요.${conversation.active ? ` ${conversation.speaker === "counterpart" ? scene.name : "나"}: ${speech}` : ""}${index === 0 ? " 익명 회사원 한 명이 출근하고, 두 명은 서서 대화해요. 리셉션 직원과 원형 테이블에서 대화하는 직원 두 명이 있어요." : ""}`}>
      <AnimatePresence initial={false}>
        <motion.img key={index} className="mirror-pixel-background" src={scene.background} alt="" width="1536" height="1024" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} />
      </AnimatePresence>
      <span className="mirror-pixel-location">{scene.label}</span>
      {index === 0 && [anonymousOne, anonymousTwo, anonymousThree].map((image, i) => {
        const worker = anonymousSceneState(phase, i, reduced, blocked);
        return <div key={i} className="mirror-pixel-anonymous" aria-hidden="true" style={{ transform: `translateX(${worker.left / PIXEL_ACTOR_WIDTH * 100}%)`, bottom: `${i === 0 ? 12 : 22}%`, opacity: worker.opacity }}>
          <div className={`mirror-pixel-sprite${worker.walking ? " is-walking" : ""}${i > 0 && !reduced && !blocked ? " is-talking" : ""}`} style={{ backgroundImage: `url(${image})`, backgroundSize: "400% 100%", backgroundPositionX: i > 0 ? "33.333333%" : undefined, animationDelay: i === 2 ? "-.6s" : "0s", transform: i === 2 ? "scaleX(-1)" : undefined, animationPlayState: visible ? "running" : "paused" }} />
        </div>;
      })}
      <div key={`counterpart-${index}`} className="mirror-pixel-counterpart" data-tone={scene.tone} data-talking={conversation.animated && conversation.speaker === "counterpart"} style={{ left: `${scene.deskLeft}%`, bottom: `${scene.deskBottom}%` }} aria-hidden="true"><span>{scene.name}</span><img src={scene.counterpart} className={conversation.animated && conversation.speaker === "counterpart" ? "is-talking" : ""} style={{animationPlayState: visible ? "running" : "paused"}} alt="" width="96" height="160" /></div>
      <div className="mirror-pixel-participant" style={{ transform: `translateX(${actor.left / PIXEL_ACTOR_WIDTH * 100}%)`, bottom: `${scene.deskBottom}%` }} aria-hidden="true">
        <span>나</span>
        <div className={`mirror-pixel-sprite${actor.walking ? " is-walking" : ""}${conversation.animated && conversation.speaker === "participant" ? " is-talking" : ""}`} style={{ backgroundImage: `url(${actor.walking ? walk : idle})`, animationPlayState: visible ? "running" : "paused" }} />
      </div>
      {conversation.active && <div className="mirror-pixel-bubble" aria-hidden="true" data-speaker={conversation.speaker} style={{left: `${(actor.left + scene.deskLeft) / 2 + PIXEL_ACTOR_WIDTH / 2}%`, bottom: `${scene.deskBottom + 27}%`}}><strong>{conversation.speaker === "counterpart" ? scene.name : "나"}</strong><span>{speech}</span></div>}
      {index === 0 && !blocked && <div className="mirror-pixel-smalltalk" aria-hidden="true" style={{left:"28%",bottom:"49%"}}>{phase.progress < .5 ? "좋은 아침이에요!" : "오늘도 힘내요!"}</div>}
    </div>
    <p className="mirror-office-caption"><span className="mirror-participant-dot" />{blocked ? "운영자 확인이 끝나면 안내를 시작해요." : "아이보리 옷이 나예요. 장면은 자동으로 이어져요."}</p>
  </div>;
}

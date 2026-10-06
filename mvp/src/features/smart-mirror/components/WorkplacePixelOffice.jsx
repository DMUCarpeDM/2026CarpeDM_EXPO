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
import { pixelSceneState, anonymousSceneState } from "../lib/workplacePixelScene";

export const pixelOfficeScenes = [
  { background: commute, counterpart: senior, label: "출근 · 사무실 입구", name: "박선임", tone: "blue", deskLeft: 53, deskBottom: 30 },
  { background: work, counterpart: leader, label: "업무 · 협업 공간", name: "김팀장", tone: "purple", deskLeft: 62, deskBottom: 36 },
  { background: departure, counterpart: colleague, label: "퇴근 · 저녁 업무 공간", name: "이동료", tone: "green", deskLeft: 62, deskBottom: 36 },
];

export function WorkplacePixelOffice({ phase, reduced, blocked, visible }) {
  const index = Math.max(0, phase.scene);
  const scene = pixelOfficeScenes[index];
  const actor = pixelSceneState(phase, reduced, blocked);
  return <div className="mirror-office">
    <div className="mirror-pixel-stage" role="img" aria-label={`${scene.label}. 아이보리 옷의 참여자가 왼쪽에서 오른쪽으로 이동하며 책상 앞의 ${scene.name}을 만나요.${index === 0 ? " 익명 회사원 세 명이 출근하고, 리셉션 직원과 원형 테이블에서 대화하는 직원 두 명이 있어요." : ""}`}>
      <AnimatePresence initial={false}>
        <motion.img key={index} className="mirror-pixel-background" src={scene.background} alt="" width="1536" height="1024" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} />
      </AnimatePresence>
      <span className="mirror-pixel-location">{scene.label}</span>
      {index === 0 && [anonymousOne, anonymousTwo, anonymousThree].map((image, i) => {
        const worker = anonymousSceneState(phase, i, reduced, blocked);
        return <div key={i} className="mirror-pixel-anonymous" aria-hidden="true" style={{ transform: `translateX(${worker.left / 9 * 100}%)`, bottom: `${24 + i * 6}%`, opacity: worker.opacity }}>
          <div className={`mirror-pixel-sprite${worker.walking ? " is-walking" : ""}`} style={{ backgroundImage: `url(${image})`, backgroundSize: "400% 100%", animationPlayState: visible ? "running" : "paused" }} />
        </div>;
      })}
      <div key={`counterpart-${index}`} className="mirror-pixel-counterpart" data-tone={scene.tone} style={{ left: `${scene.deskLeft}%`, bottom: `${scene.deskBottom}%` }} aria-hidden="true"><span>{scene.name}</span><img src={scene.counterpart} alt="" width="96" height="160" /></div>
      <div className="mirror-pixel-participant" style={{ transform: `translateX(${actor.left / 16 * 100}%)` }} aria-hidden="true">
        <span>나</span>
        <div className={`mirror-pixel-sprite${actor.walking ? " is-walking" : ""}`} style={{ backgroundImage: `url(${actor.walking ? walk : idle})`, animationPlayState: visible ? "running" : "paused" }} />
      </div>
    </div>
    <p className="mirror-office-caption"><span className="mirror-participant-dot" />아이보리 옷이 나예요. 장면은 자동으로 이어져요.</p>
  </div>;
}

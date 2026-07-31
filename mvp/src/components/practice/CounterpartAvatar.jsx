import { motion } from "framer-motion";

// 상대 비주얼 폴백 (S-B2B-EMOTION 연출 보조) — 실사 영상 자산이 없는 캐릭터의
// "상대가 화면에 존재하는" 감각을 채운다. 현재 배우 촬영분은 김서윤 팀장
// 4클립(듣기/말하기/긍정/부정)뿐이라, 그 외 인물(팩 페르소나·선임·임원 등)은
// 이 카드가 이름·역할·발화 상태·감정 온도 색을 실시간으로 보여준다.
// 캐릭터별 영상이 촬영되면 TeamLeadVideo 쪽에 클립을 등록해 이 카드를 대체한다.
export function CounterpartAvatar({ name = "AI 상대", role = "", speaking = false, emotion = null }) {
  const stateLabel = speaking ? "말하는 중" : "듣는 중";
  const tint = emotion?.color;
  return (
    <div
      className={`counterpart-card${speaking ? " is-speaking" : ""}`}
      style={tint ? { "--avatar-tint": tint } : undefined}
      aria-label={`${name} ${stateLabel}`}
    >
      <motion.span
        className="counterpart-card-face"
        animate={speaking ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={speaking ? { repeat: Infinity, duration: 1.1, ease: "easeInOut" } : { duration: 0.2 }}
      >
        <b>{name.slice(0, 1)}</b>
      </motion.span>
      <span className="counterpart-card-meta">
        <strong>{name}</strong>
        {role && <small>{role}</small>}
        <i>{stateLabel}</i>
      </span>
    </div>
  );
}

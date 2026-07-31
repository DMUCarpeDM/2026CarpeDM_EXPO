import { motion } from "framer-motion";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import cafeOndoMark from "../../assets/brand/cafe-ondo-mark.svg";
import { JOB_ROLES } from "../../lib/nfc";

/** 미러 NFC 수동 폴백 (E-20 / S-B2B-106) — resolve 404(미등록·폐기 카드) 때 홈 위에 뜬다.
 *  카드 미인식이 체험 중단이 되면 안 된다: 직무 3버튼으로 같은 흐름(동의 → 연습)을 잇는다.
 */
export function NfcStartFallback({ onPick, onClose }) {
  return (
    <div className="nfc-fallback-overlay" role="dialog" aria-label="카드 미인식 — 직무 선택으로 시작">
      <motion.div
        className="nfc-fallback-card"
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <img className="nfc-fallback-mark" src={cafeOndoMark} alt="" aria-hidden="true" />
        <h2>카드가 인식되지 않아요</h2>
        <p>직무를 선택해 시작하세요 — 발급 카드 없이도 같은 연습을 바로 진행할 수 있어요.</p>
        <div className="nfc-fallback-roles">
          {JOB_ROLES.map((role) => (
            <button key={role.id} type="button" onClick={() => onPick(role)}>
              <strong>{role.label}</strong>
              <small>{role.text}</small>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
        <button type="button" className="nfc-fallback-close" onClick={onClose}>닫기 — 카드를 다시 태그해 볼게요</button>
      </motion.div>
    </div>
  );
}

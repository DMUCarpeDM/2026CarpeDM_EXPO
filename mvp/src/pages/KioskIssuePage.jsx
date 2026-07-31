import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "reicon-react/icons/Check";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import cafeOndoLogo from "../assets/brand/cafe-ondo-logo.svg";
import cafeOndoMark from "../assets/brand/cafe-ondo-mark.svg";
import { JOB_ROLES, isValidUid } from "../lib/nfc";
import { issueNfcCard } from "../lib/pocApi";
import { useNfcTap } from "../lib/useNfcTap";

/** 카드 발급 키오스크 (E-17 / S-B2B-104) — ?kiosk=issue로 진입하는 전용 화면.
 *
 *  흐름: ① 직무 선택 → ② 카드 태그 대기(kiosk 리더 1초 폴링) → ③ 발급(POST /nfc/issue)
 *  → ④ 완료 안내 → 8초 뒤 ①로 자동 복귀. 오류(422·네트워크)는 운영자용 토스트 후 대기로 복귀.
 *  수동 폴백: 리더가 카드를 못 읽으면 운영자가 UID를 직접 입력해 발급한다 (S-B2B-106).
 *  이 화면은 발급 PC 전용이라 전시 유휴 리셋(AttractLoop·리포트 타임아웃) 대상이 아니며
 *  자체 복귀(8초)만 사용한다.
 */
const DONE_RETURN_MS = 8000;
const TOAST_MS = 4000;

const stepRise = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
};

export function KioskIssuePage() {
  const [stage, setStage] = useState("select"); // select | wait | done
  const [jobRole, setJobRole] = useState(null);
  const [issuedCard, setIssuedCard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUid, setManualUid] = useState("");
  const busyRef = useRef(false);
  const toastTimerRef = useRef(0);

  // 운영자용 오류 토스트 — 잠깐 보여주고 스스로 사라진다 (관람객 흐름을 막지 않는다).
  const showToast = (message) => {
    window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), TOAST_MS);
  };
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const reset = () => {
    setStage("select");
    setJobRole(null);
    setIssuedCard(null);
    setManualOpen(false);
    setManualUid("");
  };

  // 발급 완료 화면은 8초 뒤 직무 선택으로 자동 복귀한다 (다음 관람객 준비).
  useEffect(() => {
    if (stage !== "done") return undefined;
    const timer = window.setTimeout(reset, DONE_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const issue = async (uid) => {
    if (busyRef.current || !jobRole) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const card = await issueNfcCard({ uid, jobRole: jobRole.id });
      setIssuedCard(card);
      setStage("done");
      setManualOpen(false);
      setManualUid("");
    } catch (error) {
      // 422(알 수 없는 직무)·네트워크 오류 — 짧은 안내 후 대기 화면 유지
      showToast(error?.message || "발급에 실패했어요. 카드를 다시 태그해 주세요.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // 카드 태그 감지 — 대기 화면일 때만 kiosk 리더를 폴링한다 (누수 없이 자동 정리).
  useNfcTap({
    reader: "kiosk",
    enabled: stage === "wait",
    onTap: (tap) => issue(tap.uid),
  });

  const submitManualUid = () => {
    const uid = manualUid.trim();
    if (!isValidUid(uid)) {
      showToast("UID 형식이 올바르지 않아요 — 16진수 4~32자로 입력해 주세요.");
      return;
    }
    issue(uid);
  };

  return (
    <main className="kiosk-issue-screen" data-stage={stage}>
      <header className="kiosk-issue-brand">
        <img src={cafeOndoLogo} alt="카페 온도 (CAFE ONDO) — 가상 프랜차이즈" />
        <span className="kiosk-issue-badge">직무 카드 발급</span>
      </header>

      <AnimatePresence mode="wait">
        {stage === "select" && (
          <motion.section key="select" className="kiosk-issue-step" {...stepRise} aria-label="직무 선택">
            <h1>어떤 직무로 일해볼까요?</h1>
            <p className="kiosk-issue-sub">직무를 고르면 카드를 발급해 드려요. 미러에 카드를 태그하면 바로 근무가 시작돼요.</p>
            <div className="kiosk-role-grid">
              {JOB_ROLES.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={`kiosk-role-card ${role.brand}`}
                  onClick={() => { setJobRole(role); setStage("wait"); }}
                >
                  <img src={cafeOndoMark} alt="" aria-hidden="true" />
                  <strong>{role.label}</strong>
                  <small>{role.text}</small>
                  <em>카드 발급하기 <ChevronRight size={15} aria-hidden="true" /></em>
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {stage === "wait" && (
          <motion.section key="wait" className="kiosk-issue-step" {...stepRise} aria-label="카드 태그 대기">
            <div className="kiosk-tap-zone" aria-hidden="true">
              <span className="kiosk-tap-ripple" />
              <span className="kiosk-tap-ripple delay" />
              <span className="kiosk-tap-card"><img src={cafeOndoMark} alt="" /></span>
            </div>
            <h1>{busy ? "카드를 발급하고 있어요" : "카드를 리더에 올려주세요"}</h1>
            <p className="kiosk-issue-sub">
              <span className="kiosk-wait-role">{jobRole?.label}</span> 카드를 준비했어요.
              {busy ? " 잠시만 기다려 주세요." : " 카드를 올리면 자동으로 발급돼요."}
            </p>
            <span className={`kiosk-wait-spinner ${busy ? "is-busy" : ""}`} aria-hidden="true" />

            <div className="kiosk-manual">
              {!manualOpen ? (
                <button type="button" className="kiosk-manual-toggle" onClick={() => setManualOpen(true)}>
                  카드가 인식되지 않나요?
                </button>
              ) : (
                <div className="kiosk-manual-panel">
                  <label htmlFor="kiosk-manual-uid">운영자용 — 카드 UID 직접 입력</label>
                  <div className="kiosk-manual-row">
                    <input
                      id="kiosk-manual-uid"
                      value={manualUid}
                      onChange={(event) => setManualUid(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") submitManualUid(); }}
                      placeholder="예: 04A1B2C3D4"
                      autoComplete="off"
                      spellCheck="false"
                      disabled={busy}
                    />
                    <button type="button" onClick={submitManualUid} disabled={busy || !manualUid.trim()}>발급</button>
                  </div>
                  <small>카드 뒷면·리더 프로그램에 표시된 UID(16진수)를 입력해요.</small>
                </div>
              )}
            </div>
            <button type="button" className="kiosk-back-link" onClick={reset} disabled={busy}>직무 다시 선택</button>
          </motion.section>
        )}

        {stage === "done" && (
          <motion.section key="done" className="kiosk-issue-step" {...stepRise} aria-label="발급 완료">
            <motion.span
              className="kiosk-done-check"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
            >
              <Check size={44} aria-hidden="true" />
            </motion.span>
            <h1>카드 발급 완료</h1>
            <p className="kiosk-done-role"><strong>{jobRole?.label}</strong> 카드가 준비됐어요.</p>
            <p className="kiosk-issue-sub">미러 앞에서 카드를 태그하면 바로 시작됩니다.</p>
            {issuedCard?.issued_count > 1 && (
              <small className="kiosk-done-note">재발급된 카드예요 — 이전 직무 설정은 새 직무로 바뀌었어요.</small>
            )}
            <div className="kiosk-done-return" aria-hidden="true">
              <i style={{ animationDuration: `${DONE_RETURN_MS}ms` }} />
            </div>
            <button type="button" className="kiosk-back-link" onClick={reset}>바로 처음으로</button>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="kiosk-toast"
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="kiosk-issue-foot">
        <span>한 잔의 온도를 지키는 사람들 — 카페 온도는 훈련용 가상 프랜차이즈예요.</span>
      </footer>
    </main>
  );
}

/** 스마트 글래스 HUD — 역할극의 1인칭 문법 (미러 문법의 대응물).
 *
 * 미러 뷰가 "거울 속 나를 보며 자의식을 다스리는" 사후 성찰형이라면, 글래스 뷰는
 * "상대를 마주한 나의 시야에 코칭이 겹쳐 뜨는" 실시간 넛지형이다. 같은 세션 로직·
 * 같은 비언어 측정(useNonverbal)을 쓰되, 표현만 헤드업 디스플레이로 바꾼다:
 *   - 상단 = 마주한 상대의 존재(아바타·자막)
 *   - 중앙 = 실시간 코칭 큐 (이 화면의 주인공 — 대화 중 시야 가장자리에 뜨는 조언)
 *   - 하단 = 4-Fit 주변시야 게이지 + 터치 컨트롤
 *
 * 실제 글래스 카메라는 바깥(상대)을 향해 착용자 자신의 시선·자세를 못 잡으므로,
 * 라이브 신호는 착용자를 향한 외부 카메라(기존 웹캠)가 공급한다 — 이 화면은
 * "글래스로 보면 코칭이 이렇게 뜬다"를 재현한다. 카메라·오버레이는 숨겨 두고
 * (자기 반사가 아니라 상대가 화면의 주인공이다) 훅에만 프레임을 공급한다.
 *
 * 실시간 큐는 useNonverbal이 이미 내보내는 `live` 상태에서 파생한다 —
 * 비언어 파이프라인(병합 조율 중인 파일들)은 건드리지 않는다.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Character, EpisodeBriefing, RoleplaySession, Turn, TurnSignals } from '../../api/types';
import Avatar from '../../components/Avatar';
import { useFxEnabled } from '../../components/FrameGlow';
import Icon from '../../components/Icon';
import type { CoachingTip, LiveState } from './useNonverbal';

interface GlassesRoleplayProps {
  session: RoleplaySession;
  currentTurn: Turn;
  character: Character;
  reactionCharacter: Character | null;
  phase: 'reaction' | 'question';
  aiSpeaking: boolean;
  secondsLeft: number;
  totalSeconds: number;
  recording: boolean;
  submitting: boolean;
  draft: string;
  interim: string;
  notice: string;
  live: LiveState;
  cameraReady: boolean;
  tip: CoachingTip | null;
  lastSignals: TurnSignals | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  briefingOpen: boolean;
  briefing: EpisodeBriefing | undefined;
  onStartDay: () => void;
  toggleMic: () => void;
  submit: () => void;
  finish: () => void;
}

type CueTone = 'ok' | 'warn' | 'info';
interface Cue {
  text: string;
  tone: CueTone;
}

// 이탈 방향 → 자연스러운 조사 (좌/우는 시선 코칭상 구분이 무의미해 '옆'으로 합친다)
const OFF_DIR_LABEL: Record<string, string> = { down: '아래로', up: '위로', left: '옆으로', right: '옆으로' };

// 실시간 큐 디바운스: 조건이 이만큼 지속돼야 뜨고, 한 번 뜨면 이만큼은 유지한다.
// 5Hz로 갱신되는 live에 그대로 반응시키면 경계값에서 깜빡이므로 히스테리시스를 준다.
const CUE_APPEAR_MS = 900;
const CUE_MIN_SHOW_MS = 2200;
const MIC_QUIET = 0.04; // 말하는 중인데 이 아래면 성량 부족으로 본다

/** live 스냅샷에서 지금 가장 중요한 코칭 한마디를 뽑는다 (우선순위 순). */
function deriveCue(live: LiveState, recording: boolean): Cue | null {
  if (!live.tracking) return { text: '시야 안에 들어와 주세요', tone: 'info' };
  if (!live.calibrated) return null; // 보정 전에는 교정 넛지를 억제한다 (오판 방지)
  if (live.headDown) return { text: '고개를 들어 눈을 맞추세요', tone: 'warn' };
  if (!live.front) {
    const d = live.offDir ? OFF_DIR_LABEL[live.offDir] : '';
    return { text: d ? `시선이 ${d} 흘렀어요 — 상대를 보세요` : '상대의 눈을 바라보세요', tone: 'warn' };
  }
  if (live.tiltDeg > 8) return { text: '어깨를 펴고 바르게 앉으세요', tone: 'warn' };
  if (recording && live.micLevel < MIC_QUIET) return { text: '조금 더 또렷하게 말해보세요', tone: 'warn' };
  if (recording) return { text: '좋아요 — 지금처럼 눈을 맞추고 말하세요', tone: 'ok' };
  return null;
}

type GaugeState = 'ok' | 'warn' | 'idle';

/** 4-Fit 주변시야 게이지 (미러의 오라와 같은 신호원, HUD 문법으로 표현). */
function gauges(props: GlassesRoleplayProps): { key: string; label: string; value: string; state: GaugeState }[] {
  const { live, cameraReady, recording, lastSignals } = props;
  const eye: GaugeState = cameraReady ? (live.front ? 'ok' : 'warn') : 'idle';
  const posture: GaugeState = cameraReady ? (live.tiltDeg <= 6 && !live.headDown ? 'ok' : 'warn') : 'idle';
  const voice: GaugeState = recording ? (live.micLevel > 0.05 ? 'ok' : 'warn') : 'idle';
  const response: GaugeState = lastSignals
    ? lastSignals.coverage >= 0.75 && lastSignals.risk_hits === 0
      ? 'ok'
      : lastSignals.coverage >= 0.4
        ? 'warn'
        : 'warn'
    : 'idle';
  const eyeVal = !cameraReady
    ? '—'
    : live.front
      ? '눈맞춤'
      : `이탈${live.offDir ? `·${OFF_DIR_LABEL[live.offDir].replace('로', '')}` : ''}`;
  const postureVal = !cameraReady ? '—' : live.headDown ? '고개↓' : `${live.tiltDeg.toFixed(0)}°`;
  return [
    { key: 'eye', label: '시선', value: eyeVal, state: eye },
    { key: 'posture', label: '자세', value: postureVal, state: posture },
    { key: 'voice', label: '음성', value: recording ? '측정 중' : '대기', state: voice },
    { key: 'response', label: '응답', value: lastSignals ? `${Math.round(lastSignals.coverage * 100)}%` : '—', state: response },
  ];
}

export default function RoleplayGlassesView(props: GlassesRoleplayProps) {
  const {
    session, currentTurn, character, reactionCharacter, phase, aiSpeaking,
    secondsLeft, totalSeconds, recording, submitting, draft, interim, notice,
    live, cameraReady, videoRef, overlayRef, briefingOpen, briefing, onStartDay,
    toggleMic, submit, finish,
  } = props;

  const fxEnabled = useFxEnabled();
  const urgent = secondsLeft <= 30;
  const pressure = currentTurn.question_type === 'pressure';
  const showReaction = phase === 'reaction' && !!currentTurn.reaction_text;
  const speaker = showReaction && reactionCharacter ? reactionCharacter : character;

  // ── 실시간 코칭 큐 (히스테리시스로 깜빡임 억제) ───────────────────────────
  const [cue, setCue] = useState<Cue | null>(null);
  const candRef = useRef<{ text: string; since: number }>({ text: '', since: 0 });
  const shownUntilRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    const c = cameraReady && !briefingOpen ? deriveCue(live, recording) : null;
    const candText = c?.text ?? '';
    if (candText !== candRef.current.text) candRef.current = { text: candText, since: now };
    setCue((prev) => {
      if (c && now - candRef.current.since >= CUE_APPEAR_MS) {
        if (!prev || prev.text !== c.text) {
          shownUntilRef.current = now + CUE_MIN_SHOW_MS;
          return c;
        }
        return prev; // 같은 큐 지속 — 그대로 유지
      }
      if (prev && now >= shownUntilRef.current) return null; // 최소 표시시간 지나면 해제
      return prev;
    });
  }, [live, recording, cameraReady, briefingOpen]);

  const micLevelPct = Math.round(live.micLevel * 100);

  return (
    <div className={`glasses-hud ${pressure ? 'pressure' : ''} ${fxEnabled ? '' : 'no-fx'}`}>
      {/* HUD 프레임: 모서리 브래킷 + 비네트 (착용자 시야의 재현) */}
      <div className="glasses-frame" aria-hidden>
        <span className="gf-corner tl" />
        <span className="gf-corner tr" />
        <span className="gf-corner bl" />
        <span className="gf-corner br" />
      </div>

      {/* 상단 상태 바 */}
      <div className="glasses-topbar">
        <span className={`glasses-clock ${urgent ? 'urgent' : ''}`}>
          <Icon name="activity" size={13} />
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
        <span className="glasses-brand">4-FIT · LIVE COACH</span>
        <span className="glasses-priv">
          <Icon name="eye" size={13} /> 영상 미전송
        </span>
      </div>
      <div className="glasses-progress" aria-hidden>
        <div className="glasses-progress-fill" style={{ width: `${(secondsLeft / totalSeconds) * 100}%` }} />
      </div>

      {/* 카메라는 숨은 센서 — 상대가 화면의 주인공이다 (훅에만 프레임 공급) */}
      <div className="glasses-camera-hidden" aria-hidden>
        <video ref={videoRef} muted playsInline />
        <canvas ref={overlayRef} width={640} height={480} />
      </div>

      {briefingOpen && briefing ? (
        /* 브리핑 = 시선 보정 의식 (HUD 부팅 시퀀스) */
        <div className="glasses-briefing">
          <span className="glasses-boot">HUD 초기화 · 시선 보정</span>
          {currentTurn.virtual_time && <span className="glasses-clock big">{currentTurn.virtual_time}</span>}
          <h2 className="glasses-briefing-title">{briefing.title}</h2>
          <p className="glasses-briefing-scene">{briefing.situation}</p>
          <div className="glasses-briefing-points">
            {briefing.points.map((p) => (
              <span key={p} className="glasses-chip">{p}</span>
            ))}
          </div>
          <div className={`glasses-calib-ring ${cameraReady ? 'active' : ''}`} aria-hidden>
            <span className="glasses-calib-dot" />
          </div>
          <p className="glasses-briefing-calib">
            {cameraReady
              ? '정면을 바라본 채로 잠시 — 착용자 기준선을 잡는 중이에요'
              : '카메라 없이 진행합니다. 준비되면 시작하세요'}
          </p>
          <button className="primary-btn glasses-start-btn" onClick={onStartDay}>
            {session.difficulty === 'pressure' ? '준비됐어요 — 압박까지 받아볼게요' : '준비됐어요, 시작할게요'}
          </button>
        </div>
      ) : (
        <>
         <div className="glasses-stage">
          {/* 마주한 상대 */}
          <div className={`glasses-target ${aiSpeaking ? 'speaking' : ''}`}>
            <div className="glasses-target-avatar">
              <Avatar characterId={speaker.id} name={speaker.name} size={72} />
              {aiSpeaking && <span className="glasses-speaking-ping" aria-hidden />}
            </div>
            <strong className="glasses-target-name">{speaker.name}</strong>
            <span className="glasses-target-role">{speaker.role}</span>
            {pressure && !showReaction && <span className="glasses-pressure-chip">압박 질문</span>}
          </div>

          {/* 실시간 코칭 큐 — HUD의 주인공 */}
          <div className="glasses-cue-slot" aria-live="polite">
            {cue && (
              <div className={`glasses-cue ${cue.tone}`}>
                <span className="glasses-cue-icon" aria-hidden>
                  <Icon name={cue.tone === 'ok' ? 'check' : cue.tone === 'warn' ? 'eye' : 'search'} size={16} />
                </span>
                {cue.text}
              </div>
            )}
          </div>

          {/* 자막 */}
          <div className="glasses-subtitle">
            {recording && (draft || interim) ? (
              <p className="glasses-sub-mine">
                {draft} <span className="interim">{interim}</span>
              </p>
            ) : recording ? (
              <p className="glasses-sub-listening">듣고 있어요 — 편하게 말씀하세요</p>
            ) : (
              <p className="glasses-sub-line">
                {showReaction ? currentTurn.reaction_text : currentTurn.question_text}
              </p>
            )}
            {notice && <p className="glasses-notice">{notice}</p>}
          </div>

          {/* 4-Fit 주변시야 게이지 */}
          <div className="glasses-gauges" aria-hidden>
            {gauges(props).map((g) => (
              <span key={g.key} className={`glasses-gauge ${g.state}`}>
                <span className="glasses-gauge-orb" />
                <span className="glasses-gauge-label">{g.label}</span>
                <span className="glasses-gauge-value">{g.value}</span>
                {g.key === 'voice' && recording && (
                  <span className="glasses-mic-bar">
                    <span className="glasses-mic-fill" style={{ width: `${micLevelPct}%` }} />
                  </span>
                )}
              </span>
            ))}
          </div>
         </div>

          {/* 컨트롤 — 무대 밖 하단 고정 (긴 자막에도 잘리지 않도록) */}
          <div className="glasses-controls">
            <button
              className={`glasses-mic-btn ${recording ? 'recording' : ''}`}
              onClick={toggleMic}
              disabled={submitting}
              aria-label={recording ? '녹음 정지' : '음성으로 답하기'}
            >
              <Icon name={recording ? 'stop' : 'mic'} size={30} />
            </button>
            <button
              className="primary-btn glasses-submit-btn"
              onClick={submit}
              disabled={submitting || (!recording && !draft.trim())}
            >
              {submitting ? '전달 중…' : '전달'}
            </button>
            <button className="glasses-finish-link" onClick={finish} disabled={submitting}>
              마치고 결과 보기
            </button>
          </div>
        </>
      )}
    </div>
  );
}

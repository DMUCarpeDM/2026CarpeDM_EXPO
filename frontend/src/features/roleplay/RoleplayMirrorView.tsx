/** 거울 속 면담 — 역할극의 미러 문법 (기획서 §4.3).
 *
 * 채팅앱이 아니라 "눈앞의 상대와의 면담"이다:
 * - 현재 턴 하나만 존재. 히스토리는 리포트가 담당.
 * - 상단 = 상대의 존재(아바타·가상 시각), 중앙 = 비움(체험자의 반사),
 *   하단 = 자막·라이브 오라·터치 컨트롤.
 * - 타이머는 숫자 대신 상단 빛의 선이 줄어드는 앰비언트 표현 (마지막 30초만 숫자).
 * - 4-Fit 라이브 오라: 숫자·게이지 없이 빛의 밝기로만 실시간 상태를 전한다 —
 *   대화를 끊지 않고, 거울 앞의 자의식을 자극하지 않는 실시간 피드백.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Character, EpisodeBriefing, RoleplaySession, Turn, TurnSignals } from '../../api/types';
import Avatar from '../../components/Avatar';
import FrameGlow, { type GlowState } from '../../components/FrameGlow';
import Icon from '../../components/Icon';
import MirrorStage from '../../components/MirrorStage';
import type { CoachingTip, LiveState } from './useNonverbal';

interface MirrorRoleplayProps {
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

type AuraState = 'idle' | 'ok' | 'mid' | 'warn';

function auraStates(props: MirrorRoleplayProps): { key: string; label: string; state: AuraState }[] {
  const { lastSignals, recording, live, cameraReady } = props;
  const response: AuraState = lastSignals
    ? lastSignals.coverage >= 0.75 && lastSignals.risk_hits === 0
      ? 'ok'
      : lastSignals.coverage >= 0.4
        ? 'mid'
        : 'warn'
    : 'idle';
  const voice: AuraState = recording ? (live.micLevel > 0.05 ? 'ok' : 'mid') : 'idle';
  const eye: AuraState = cameraReady ? (live.front ? 'ok' : 'warn') : 'idle';
  const posture: AuraState = cameraReady
    ? live.tiltDeg <= 6 && !live.headDown
      ? 'ok'
      : 'warn'
    : 'idle';
  return [
    { key: 'response', label: '응답', state: response },
    { key: 'voice', label: '음성', state: voice },
    { key: 'eye', label: '시선', state: eye },
    { key: 'posture', label: '자세', state: posture },
  ];
}

export default function RoleplayMirrorView(props: MirrorRoleplayProps) {
  const {
    session, currentTurn, character, reactionCharacter, phase, aiSpeaking,
    secondsLeft, totalSeconds, recording, submitting, draft, interim, notice,
    tip, videoRef, overlayRef, briefingOpen, briefing, onStartDay,
    toggleMic, submit, finish, cameraReady,
  } = props;

  const urgent = secondsLeft <= 30;
  const pressure = currentTurn.question_type === 'pressure';
  const showReaction = phase === 'reaction' && !!currentTurn.reaction_text;
  const speaker = showReaction && reactionCharacter ? reactionCharacter : character;

  // 장면 전환 "페이드 투 미러" — 에피소드가 바뀌면 화면이 잠깐 거울로 돌아갔다가
  // 다음 장면의 시각·제목이 떠오른다. 시간이 흘렀다는 감각이 하루를 만든다 (§원칙 5)
  const [sceneCut, setSceneCut] = useState<{ time: string; title: string } | null>(null);
  const prevEpisodeRef = useRef(currentTurn.episode_id);
  useEffect(() => {
    if (currentTurn.episode_id === prevEpisodeRef.current) return;
    prevEpisodeRef.current = currentTurn.episode_id;
    setSceneCut({ time: currentTurn.virtual_time, title: currentTurn.episode_title });
    const t = window.setTimeout(() => setSceneCut(null), 2300);
    return () => window.clearTimeout(t);
  }, [currentTurn.episode_id, currentTurn.virtual_time, currentTurn.episode_title]);

  // 프레임 글로우 상태 — 빛 하나가 시스템의 표정을 담당한다
  const glow: GlowState = briefingOpen
    ? 'idle'
    : recording
      ? 'mine'
      : pressure
        ? 'pressure'
        : aiSpeaking
          ? 'ai'
          : 'idle';

  return (
    <div className={`mirror-roleplay ${pressure ? 'pressure' : ''}`}>
      <FrameGlow state={glow} />
      {/* 앰비언트 타이머 — 하루가 빛의 선으로 줄어든다 */}
      <div className={`mirror-timeline ${urgent ? 'urgent' : ''}`} aria-hidden>
        <div
          className="mirror-timeline-fill"
          style={{ width: `${(secondsLeft / totalSeconds) * 100}%` }}
        />
      </div>

      <MirrorStage
        presence={
          <div className={`mirror-presence ${aiSpeaking ? 'speaking' : ''}`}>
            {currentTurn.virtual_time && (
              <span className="mirror-clock">{currentTurn.virtual_time}</span>
            )}
            <div className="mirror-presence-avatar">
              <Avatar characterId={speaker.id} name={speaker.name} size={96} />
            </div>
            <strong className="mirror-presence-name">{speaker.name}</strong>
            <span className="mirror-presence-role">{speaker.role}</span>
            {pressure && !showReaction && <span className="mirror-pressure-chip">압박 질문</span>}
          </div>
        }
        reflection={
          <>
            {/* 카메라는 보이지 않는 센서 — 반사가 화면의 주인공이다 */}
            <div className="mirror-camera-hidden" aria-hidden>
              <video ref={videoRef} muted playsInline />
              <canvas ref={overlayRef} width={640} height={480} />
            </div>
            {tip && !briefingOpen && <div className="mirror-toast">{tip.text}</div>}
            {urgent && !briefingOpen && (
              <span className="mirror-urgent-count">
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            )}
          </>
        }
        subtitle={
          <div className="mirror-subtitle">
            {recording && (draft || interim) ? (
              <p className="mirror-subtitle-mine">
                {draft} <span className="interim">{interim}</span>
              </p>
            ) : recording ? (
              <p className="mirror-subtitle-listening">듣고 있어요 — 편하게 말씀하세요</p>
            ) : (
              <p
                className={`mirror-subtitle-line ${showReaction ? 'reaction' : ''} ${
                  (showReaction ? currentTurn.reaction_text : currentTurn.question_text).length > 70
                    ? 'long'
                    : ''
                }`}
              >
                {showReaction ? currentTurn.reaction_text : currentTurn.question_text}
              </p>
            )}
            {notice && <p className="mirror-notice">{notice}</p>}
          </div>
        }
        controls={
          <div className="mirror-controls">
            <div className="mirror-aura-row" aria-hidden>
              {auraStates(props).map((a) => (
                <span key={a.key} className={`mirror-aura ${a.state}`}>
                  <span className="mirror-aura-orb" />
                  <span className="mirror-aura-label">{a.label}</span>
                </span>
              ))}
            </div>
            <div className="mirror-controls-row">
              <button
                className={`mirror-mic-btn ${recording ? 'recording' : ''}`}
                onClick={toggleMic}
                disabled={submitting}
                aria-label={recording ? '녹음 정지' : '음성으로 답하기'}
              >
                <Icon name={recording ? 'stop' : 'mic'} size={40} />
              </button>
              <button
                className="primary-btn mirror-submit-btn"
                onClick={submit}
                disabled={submitting || (!recording && !draft.trim())}
              >
                {submitting ? '전달 중…' : '전달'}
              </button>
            </div>
            <button className="mirror-finish-link" onClick={finish} disabled={submitting}>
              여기서 마치고 결과 보기
            </button>
            <span className="mirror-privacy">영상은 이 거울 밖으로 나가지 않습니다</span>
          </div>
        }
      />

      {/* 장면 전환 — 잠깐 거울만 남았다가 다음 시각이 떠오른다 */}
      {sceneCut && (
        <div className="mirror-scene-cut" aria-hidden>
          {sceneCut.time && <span className="mirror-clock large">{sceneCut.time}</span>}
          <p className="mirror-scene-title">{sceneCut.title}</p>
        </div>
      )}

      {/* 브리핑 — 장면 자막 + 눈맞춤 캘리브레이션 의식 (기획서 §4.2) */}
      {briefingOpen && briefing && (
        <div className="mirror-briefing">
          {currentTurn.virtual_time && (
            <span className="mirror-clock large">{currentTurn.virtual_time}</span>
          )}
          <h2 className="mirror-briefing-title">{briefing.title}</h2>
          <p className="mirror-briefing-scene">{briefing.situation}</p>
          <div className="mirror-briefing-points">
            {briefing.points.map((p) => (
              <span key={p} className="briefing-chip">{p}</span>
            ))}
          </div>
          <div className={`mirror-gaze-ring ${cameraReady ? 'active' : ''}`} aria-hidden />
          <p className="mirror-briefing-calib">
            {cameraReady
              ? '거울 속 자신과 눈을 맞춰주세요 — 그대로 몇 초면 준비가 끝나요'
              : '카메라 없이 진행합니다. 준비되면 시작하세요'}
          </p>
          <button className="primary-btn mirror-start-btn" onClick={onStartDay}>
            {session.difficulty === 'pressure' ? '준비됐어요 — 압박까지 받아볼게요' : '준비됐어요, 시작할게요'}
          </button>
        </div>
      )}
    </div>
  );
}

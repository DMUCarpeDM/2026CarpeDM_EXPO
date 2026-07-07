import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { finishSession, getHealth, getSession, submitResponse, uploadAudio } from '../../api/client';
import type { Character, Turn, TurnSignals } from '../../api/types';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { useMirrorMode } from '../../lib/mirrorMode';
import { AudioTurnRecorder } from '../../lib/recorder';
import { isSpeechRecognitionSupported, SpeechCapture } from '../../lib/stt';
import { speak, stopSpeaking } from '../../lib/tts';
import { useSessionStore } from '../../stores/sessionStore';
import RoleplayMirrorView from './RoleplayMirrorView';
import { useNonverbal } from './useNonverbal';

const QUESTION_TYPE_LABEL: Record<Turn['question_type'], string> = {
  initial: '',
  followup: '후속 질문',
  pressure: '압박 질문',
};

export default function RoleplayPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const mirror = useMirrorMode();
  const { session, currentTurn, turnHistory, advance, restore } = useSessionStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const {
    cameraReady,
    visionStatus,
    tip,
    live,
    startTurn,
    endTurn,
    setGazePhase,
    startCalibration,
    finishCalibration,
  } = useNonverbal(videoRef, overlayRef);

  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState((session?.mode ?? 5) * 60);
  const [sttAvailable] = useState(isSpeechRecognitionSupported());
  const [serverStt, setServerStt] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // 시작 전 상황 브리핑 (기능명세 1.1.1 — 목표·연습 포인트·상대 확인)
  const [briefingOpen, setBriefingOpen] = useState(true);
  // 리액션 연출: 상대가 직전 답변에 반응한 뒤 질문으로 넘어간다 (챗봇 탈피)
  const [phase, setPhase] = useState<'reaction' | 'question'>('question');
  const [aiSpeaking, setAiSpeaking] = useState(false);
  // 라이브 오라(Response 축)용 직전 턴 즉시 신호
  const [lastSignals, setLastSignals] = useState<TurnSignals | null>(null);

  useEffect(() => {
    getHealth().then((h) => setServerStt(h.server_stt)).catch(() => undefined);
  }, []);

  const captureRef = useRef(new SpeechCapture());
  const recorderRef = useRef(new AudioTurnRecorder());
  const turnStartedAtRef = useRef(0);
  const sttUsedRef = useRef(false);
  const qualityWarnedRef = useRef(false); // STT 품질 플래그 (S-LFMFHP) — 턴당 1회만 경고
  const recordingRef = useRef(false); // 리액션→질문 지연 재생 시 녹음 중이면 TTS 억제
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const character: Character | undefined = session?.scenario.characters.find(
    (c) => c.id === currentTurn?.character_id,
  );
  const reactionCharacter: Character | null =
    session?.scenario.characters.find((c) => c.id === currentTurn?.reaction_character_id) ?? null;

  // 세션 없이 진입(새로고침·크래시 후) → URL의 세션 id로 서버에서 진행 상태 복원
  useEffect(() => {
    if (session) return;
    const id = Number(sessionId);
    if (!id) {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    getSession(id)
      .then(async (s) => {
        if (cancelled) return;
        if (s.status === 'in_progress' && s.current_turn) {
          restore(s, s.history.map((h) => ({ turn: h, response: h.response_text })));
          setSecondsLeft(Math.max(0, s.mode * 60 - s.elapsed_sec));
        } else if (s.status === 'in_progress') {
          // 대화는 끝났는데 finish 전에 끊긴 세션 — 마무리하고 리포트로
          await finishSession(id).catch(() => undefined);
          navigate(`/report/${id}`, { replace: true });
        } else if (s.status === 'analyzing' || s.status === 'completed') {
          navigate(`/report/${id}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) navigate('/', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [session, sessionId, navigate, restore]);

  // 브리핑을 표시할 수 없는 상황(에피소드 미매칭·2턴 이후)이면 자동 해제 — TTS가 막히지 않도록
  useEffect(() => {
    if (!briefingOpen || !session || !currentTurn) return;
    const hasBriefing = session.scenario.episodes?.some(
      (ep) => ep.title === currentTurn.episode_title,
    );
    if (currentTurn.order !== 1 || !hasBriefing) setBriefingOpen(false);
  }, [briefingOpen, session, currentTurn]);

  // 브리핑을 읽는 동안 정면 기준값 캘리브레이션 (카메라 각도·체형 보정)
  useEffect(() => {
    if (briefingOpen && cameraReady) startCalibration();
  }, [briefingOpen, cameraReady, startCalibration]);

  // 새 턴마다: (반응이 있으면) 반응 → 0.8초 쉼 → 질문 TTS + 비언어 측정 시작
  useEffect(() => {
    if (!currentTurn || !character || briefingOpen) return;
    startTurn();
    turnStartedAtRef.current = Date.now();

    let cancelled = false;
    let pauseTimer = 0;
    const speakQuestion = () => {
      if (cancelled) return;
      setPhase('question');
      if (recordingRef.current) return; // 이미 답하기 시작했으면 질문 TTS 생략
      speak(currentTurn.question_text, {
        ...character.tts,
        onStart: () => {
          if (cancelled) return;
          setAiSpeaking(true);
          setGazePhase('listening'); // 듣기 시선 측정 구간
        },
        onEnd: () => !cancelled && setAiSpeaking(false),
      });
    };

    if (currentTurn.reaction_text && reactionCharacter) {
      setPhase('reaction');
      speak(currentTurn.reaction_text, {
        ...reactionCharacter.tts,
        onStart: () => {
          if (cancelled) return;
          setAiSpeaking(true);
          setGazePhase('listening');
        },
        onEnd: () => {
          if (cancelled) return;
          setAiSpeaking(false);
          pauseTimer = window.setTimeout(speakQuestion, 800);
        },
      });
    } else {
      speakQuestion();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(pauseTimer);
      setAiSpeaking(false);
      stopSpeaking();
    };
  }, [currentTurn, character, reactionCharacter, startTurn, briefingOpen]);

  // 세션 타이머 (브리핑 중에는 정지)
  useEffect(() => {
    if (briefingOpen) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [briefingOpen]);

  const finish = useCallback(async () => {
    if (!session) return;
    stopSpeaking();
    try {
      await finishSession(session.id);
    } catch {
      /* 이미 종료된 세션이면 그대로 리포트로 */
    }
    navigate(`/report/${session.id}`);
  }, [session, navigate]);

  // 시간 종료 시 자동 마무리
  useEffect(() => {
    if (secondsLeft === 0 && session && !submitting) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turnHistory.length, currentTurn?.id, interim]);

  function setRecordingState(on: boolean) {
    recordingRef.current = on;
    setRecording(on);
    setGazePhase(on ? 'answering' : null); // 말하기 시선 측정 구간 전환
  }

  function toggleMic() {
    if (!currentTurn) return;
    if (recording) {
      const finalText = captureRef.current.stop();
      setRecordingState(false);
      setInterim('');
      if (finalText) {
        setDraft((d) => (d ? `${d} ${finalText}` : finalText));
        sttUsedRef.current = true;
      }
      return;
    }
    stopSpeaking();
    setAiSpeaking(false);
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    if (stream) recorderRef.current.start(stream);
    const ok = captureRef.current.start(
      (finalText, interimText) => {
        setDraft(finalText);
        setInterim(interimText);
      },
      (msg) => setNotice(msg),
    );
    if (ok) {
      setRecordingState(true);
      sttUsedRef.current = true;
    } else if (serverStt && stream) {
      // 브라우저 STT 불가(오프라인 등) → 녹음만 하고 서버가 텍스트로 변환
      setRecordingState(true);
      setNotice('오프라인 인식 모드 — 말한 뒤 정지 버튼을 누르고 전달하면 서버가 텍스트로 변환합니다.');
    } else {
      setNotice(
        mirror
          ? '음성 인식을 사용할 수 없어요. 운영자를 불러주세요.'
          : '이 브라우저는 음성 인식을 지원하지 않아요. 텍스트로 입력해주세요. (Chrome 권장)',
      );
    }
  }

  async function submit() {
    if (!session || !currentTurn || submitting) return;
    let text = draft.trim();
    if (recording) {
      text = `${text} ${captureRef.current.stop()}`.trim();
      setRecordingState(false);
      setInterim('');
    }
    setSubmitting(true);
    setNotice('');
    stopSpeaking();

    const durationMs = Date.now() - turnStartedAtRef.current;
    const nonverbal = endTurn();
    const wav = await recorderRef.current.stop();
    let audioUploaded = false;
    if (wav) {
      try {
        const result = await uploadAudio(session.id, currentTurn.id, wav);
        audioUploaded = true;
        // 오프라인 인식 모드: 서버 STT가 만든 텍스트를 사용
        if (!text && result.transcript) {
          text = result.transcript;
          sttUsedRef.current = true;
        }
      } catch {
        /* 오디오 업로드 실패 → 텍스트 기반 근사 분석으로 진행 */
      }
    }
    if (!text) {
      setNotice(
        wav && audioUploaded
          ? '음성을 인식하지 못했어요. 조금 더 길게 말하거나 텍스트로 입력해주세요.'
          : '응답을 말하거나 입력한 뒤 전달해주세요.',
      );
      setSubmitting(false);
      return;
    }

    // STT 품질 플래그 (S-LFMFHP): 인식 결과가 비정상적으로 짧으면 재응답 권장 (턴당 1회)
    const syllables = (text.match(/[가-힣]/g) ?? []).length;
    if (sttUsedRef.current && syllables < 6 && !qualityWarnedRef.current) {
      qualityWarnedRef.current = true;
      setDraft(text);
      setNotice('인식된 내용이 짧아요. 한 문장으로 다시 말하거나, 이대로 보내려면 전달을 한 번 더 눌러주세요.');
      setSubmitting(false);
      return;
    }

    try {
      const result = await submitResponse(session.id, currentTurn.id, {
        text,
        stt_source: sttUsedRef.current ? 'webspeech' : 'text',
        duration_ms: durationMs,
        nonverbal,
      });
      if (result.turn_signals) setLastSignals(result.turn_signals);
      advance(currentTurn, text, result.next_turn);
      setDraft('');
      sttUsedRef.current = false;
      qualityWarnedRef.current = false;
      if (result.finished) await finish();
    } catch {
      setNotice('응답 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!session || !currentTurn) return null;

  const briefing = session.scenario.episodes?.find((ep) => ep.title === currentTurn.episode_title);
  const totalSeconds = session.mode * 60;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  const episodeTitles = session.scenario.episode_titles[String(session.mode)] ?? [];
  const episodeIndex = episodeTitles.indexOf(currentTurn.episode_title);

  // 미러 모드 — 같은 로직, 거울 문법의 표현 계층 (기획서 §0)
  if (mirror && character) {
    return (
      <RoleplayMirrorView
        session={session}
        currentTurn={currentTurn}
        character={character}
        reactionCharacter={reactionCharacter}
        phase={phase}
        aiSpeaking={aiSpeaking}
        secondsLeft={secondsLeft}
        totalSeconds={totalSeconds}
        recording={recording}
        submitting={submitting}
        draft={draft}
        interim={interim}
        notice={notice}
        live={live}
        cameraReady={cameraReady}
        tip={tip}
        lastSignals={lastSignals}
        videoRef={videoRef}
        overlayRef={overlayRef}
        briefingOpen={briefingOpen && currentTurn.order === 1 && !!briefing}
        briefing={briefing}
        onStartDay={() => {
          finishCalibration();
          setBriefingOpen(false);
        }}
        toggleMic={toggleMic}
        submit={submit}
        finish={finish}
      />
    );
  }

  return (
    <div className="page roleplay">
      {briefingOpen && currentTurn.order === 1 && briefing && character && (
        <div className="briefing-overlay">
          <div className="briefing-card">
            <p className="hero-badge">상황을 미리 확인해요</p>
            <h2 className="briefing-title">{briefing.title}</h2>
            <p className="briefing-situation">{briefing.situation}</p>
            <div className="briefing-opponent">
              <Avatar characterId={character.id} name={character.name} size={44} />
              <div>
                <strong>{character.name}</strong>
                <span className="character-role">{character.role}</span>
                <p className="character-personality">{character.personality}</p>
              </div>
              <span className="briefing-difficulty">
                {session.difficulty === 'pressure' ? '압박 난이도' : '기본 난이도'}
              </span>
            </div>
            <div className="briefing-points">
              <span className="briefing-points-label">연습 포인트</span>
              <div className="briefing-chips">
                {briefing.points.map((p) => (
                  <span key={p} className="briefing-chip">{p}</span>
                ))}
              </div>
            </div>
            {cameraReady && (
              <p className="briefing-calib">
                카메라가 정면 기준을 측정하고 있어요 — 평소처럼 편하게 화면을 봐주세요
              </p>
            )}
            <button
              className="primary-btn start-btn"
              onClick={() => {
                finishCalibration();
                setBriefingOpen(false);
              }}
            >
              준비됐어요, 시작하기
            </button>
          </div>
        </div>
      )}
      <header className="roleplay-header">
        <div>
          <span className="episode-chip">
            {episodeIndex >= 0 && `상황 ${episodeIndex + 1}/${episodeTitles.length} · `}
            {currentTurn.episode_title}
          </span>
          {QUESTION_TYPE_LABEL[currentTurn.question_type] && (
            <span className={`type-chip ${currentTurn.question_type}`}>
              {QUESTION_TYPE_LABEL[currentTurn.question_type]}
            </span>
          )}
        </div>
        <div className={`timer ${secondsLeft < 30 ? 'urgent' : ''}`}>
          ⏱ {minutes}:{seconds}
        </div>
      </header>
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${(secondsLeft / totalSeconds) * 100}%` }} />
      </div>

      <div className="roleplay-body">
        <aside className="camera-column">
          <div className="camera-panel">
            <video ref={videoRef} muted playsInline className="camera-video" />
            <canvas ref={overlayRef} width={640} height={480} className="camera-overlay" />
            {visionStatus === 'no-camera' && (
              <div className="camera-placeholder">
                <Icon name="cameraOff" size={22} />
                카메라 미사용
                <small>시선·자세 분석 없이 진행됩니다</small>
              </div>
            )}
            {visionStatus === 'loading' && (
              <div className="camera-placeholder">
                분석 모듈 준비 중…
                <small>MediaPipe 모델을 불러오고 있어요</small>
              </div>
            )}
            {visionStatus === 'failed' && (
              <div className="camera-placeholder">
                <Icon name="cameraOff" size={22} />
                시선·자세 모듈 로드 실패
                <small>네트워크 확인 후 새로고침 하거나, npm run setup-offline으로 오프라인 자산을 준비하세요</small>
              </div>
            )}
            {tip && <div className="coaching-toast">{tip.text}</div>}
            {cameraReady && (
              <span className="live-dot">
                실시간 분석 중{live.calibrated ? ' · 기준 보정됨' : ''} · 영상은 전송되지 않습니다
              </span>
            )}
          </div>
          {cameraReady && (
            <div className="live-gauges">
              <div className={`gauge-item ${live.front ? 'ok' : 'warn'}`}>
                <span className="gauge-item-label">시선</span>
                <span className="gauge-item-value">
                  {live.front
                    ? '정면 유지'
                    : `이탈${live.offDir ? ` (${{ down: '아래', up: '위', left: '옆', right: '옆' }[live.offDir]})` : ''}`}
                </span>
              </div>
              <div className={`gauge-item ${live.tiltDeg <= 6 && !live.headDown ? 'ok' : 'warn'}`}>
                <span className="gauge-item-label">자세</span>
                <span className="gauge-item-value">
                  {live.headDown ? '고개 숙임' : `기울기 ${live.tiltDeg.toFixed(0)}°`}
                </span>
              </div>
              <div className="gauge-item">
                <span className="gauge-item-label">음량</span>
                <span className="mic-meter">
                  <span className="mic-meter-fill" style={{ width: `${Math.round(live.micLevel * 100)}%` }} />
                </span>
              </div>
            </div>
          )}
        </aside>

        <main className="chat-panel">
          <div className="chat-scroll">
            {turnHistory.map(({ turn, response }) => {
              const past = session.scenario.characters.find((c) => c.id === turn.character_id);
              return (
                <div key={turn.id} className="chat-pair">
                  <div className="bubble ai">
                    <strong>{past?.name}</strong>
                    <p>{turn.question_text}</p>
                  </div>
                  <div className="bubble user">
                    <p>{response}</p>
                  </div>
                </div>
              );
            })}
            <div className="chat-pair">
              {currentTurn.reaction_text && reactionCharacter && (
                <div className="bubble ai reaction-bubble">
                  <strong>{reactionCharacter.name}</strong>
                  <p>{currentTurn.reaction_text}</p>
                </div>
              )}
              <div className="bubble ai current">
                <strong>
                  {character?.name} <span className="character-role-inline">{character?.role}</span>
                </strong>
                <p>{currentTurn.question_text}</p>
                <button
                  className="replay-btn"
                  onClick={() => character && speak(currentTurn.question_text, character.tts)}
                >
                  <Icon name="volume" size={13} /> 다시 듣기
                </button>
              </div>
              {(draft || interim) && (
                <div className="bubble user draft">
                  <p>
                    {draft} <span className="interim">{interim}</span>
                  </p>
                </div>
              )}
            </div>
            <div ref={chatEndRef} />
          </div>

          {notice && <div className="notice">{notice}</div>}

          <div className="response-bar">
            <button
              className={`mic-btn ${recording ? 'recording' : ''}`}
              onClick={toggleMic}
              disabled={submitting}
              title={sttAvailable ? '음성으로 답하기' : '이 브라우저는 음성 인식 미지원'}
            >
              <Icon name={recording ? 'stop' : 'mic'} size={22} />
            </button>
            <input
              className="response-input"
              placeholder={recording ? '듣고 있어요… 말한 뒤 ■를 누르세요' : '또는 텍스트로 입력'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
              disabled={submitting}
            />
            <button className="primary-btn" onClick={submit} disabled={submitting}>
              {submitting ? '전달 중…' : '전달'}
            </button>
          </div>
          <button className="ghost-btn end-btn" onClick={finish} disabled={submitting}>
            여기서 마치고 결과 보기
          </button>
        </main>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { finishSession, getHealth, submitResponse, uploadAudio } from '../../api/client';
import type { Character, Turn } from '../../api/types';
import { AudioTurnRecorder } from '../../lib/recorder';
import { isSpeechRecognitionSupported, SpeechCapture } from '../../lib/stt';
import { speak, stopSpeaking } from '../../lib/tts';
import { useSessionStore } from '../../stores/sessionStore';
import { useNonverbal } from './useNonverbal';

const QUESTION_TYPE_LABEL: Record<Turn['question_type'], string> = {
  initial: '',
  followup: '후속 질문',
  pressure: '압박 질문',
};

export default function RoleplayPage() {
  const navigate = useNavigate();
  const { session, currentTurn, turnHistory, advance } = useSessionStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const { cameraReady, tip, live, startTurn, endTurn } = useNonverbal(videoRef, overlayRef);

  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState((session?.mode ?? 5) * 60);
  const [sttAvailable] = useState(isSpeechRecognitionSupported());
  const [serverStt, setServerStt] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getHealth().then((h) => setServerStt(h.server_stt)).catch(() => undefined);
  }, []);

  const captureRef = useRef(new SpeechCapture());
  const recorderRef = useRef(new AudioTurnRecorder());
  const turnStartedAtRef = useRef(0);
  const sttUsedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const character: Character | undefined = session?.scenario.characters.find(
    (c) => c.id === currentTurn?.character_id,
  );

  // 세션 없이 직접 URL 진입한 경우 온보딩으로
  useEffect(() => {
    if (!session) navigate('/', { replace: true });
  }, [session, navigate]);

  // 새 질문마다 TTS 재생 + 비언어 측정 시작
  useEffect(() => {
    if (!currentTurn || !character) return;
    startTurn();
    turnStartedAtRef.current = Date.now();
    speak(currentTurn.question_text, character.tts);
    return stopSpeaking;
  }, [currentTurn, character, startTurn]);

  // 세션 타이머
  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

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

  function toggleMic() {
    if (!currentTurn) return;
    if (recording) {
      const finalText = captureRef.current.stop();
      setRecording(false);
      setInterim('');
      if (finalText) {
        setDraft((d) => (d ? `${d} ${finalText}` : finalText));
        sttUsedRef.current = true;
      }
      return;
    }
    stopSpeaking();
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
      setRecording(true);
      sttUsedRef.current = true;
    } else if (serverStt && stream) {
      // 브라우저 STT 불가(오프라인 등) → 녹음만 하고 서버가 텍스트로 변환
      setRecording(true);
      setNotice('🎙 오프라인 인식 모드 — 말한 뒤 ■를 누르고 전달하면 서버가 텍스트로 바꿔드려요.');
    } else {
      setNotice('이 브라우저는 음성 인식을 지원하지 않아요. 텍스트로 입력해주세요. (Chrome 권장)');
    }
  }

  async function submit() {
    if (!session || !currentTurn || submitting) return;
    let text = draft.trim();
    if (recording) {
      text = `${text} ${captureRef.current.stop()}`.trim();
      setRecording(false);
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

    try {
      const result = await submitResponse(session.id, currentTurn.id, {
        text,
        stt_source: sttUsedRef.current ? 'webspeech' : 'text',
        duration_ms: durationMs,
        nonverbal,
      });
      advance(currentTurn, text, result.next_turn);
      setDraft('');
      sttUsedRef.current = false;
      if (result.finished) await finish();
    } catch {
      setNotice('응답 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!session || !currentTurn) return null;

  const totalSeconds = session.mode * 60;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  const episodeTitles = session.scenario.episode_titles[String(session.mode)] ?? [];
  const episodeIndex = episodeTitles.indexOf(currentTurn.episode_title);

  return (
    <div className="page roleplay">
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
            {!cameraReady && (
              <div className="camera-placeholder">
                카메라 미사용
                <small>시선·자세 분석 없이 진행됩니다</small>
              </div>
            )}
            {tip && <div className="coaching-toast">{tip.text}</div>}
            {cameraReady && <span className="live-dot">● 실시간 분석 중 (영상 미전송)</span>}
          </div>
          {cameraReady && (
            <div className="live-gauges">
              <div className={`gauge-item ${live.front ? 'ok' : 'warn'}`}>
                <span className="gauge-item-label">시선</span>
                <span className="gauge-item-value">{live.front ? '정면 유지' : '이탈'}</span>
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
              <div className="bubble ai current">
                <strong>
                  {character?.name} <span className="character-role-inline">{character?.role}</span>
                </strong>
                <p>{currentTurn.question_text}</p>
                <button
                  className="replay-btn"
                  onClick={() => character && speak(currentTurn.question_text, character.tts)}
                >
                  🔊 다시 듣기
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
              {recording ? '■' : '🎤'}
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

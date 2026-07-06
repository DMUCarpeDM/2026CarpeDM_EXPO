/** 미러 온보딩 — 3탭이면 출근한다 (기획서 §4.1).
 *
 * 스텝 1(하루 선택) → 스텝 2(동의) → 스텝 3(출근). 거울이 읽어주고(TTS),
 * 화면 텍스트는 요점만. 캐릭터 소개는 없다 — 사건 속에서 만나며 알게 된다.
 */
import { useEffect, useState } from 'react';
import type { Scenario } from '../../api/types';
import { speak, stopSpeaking } from '../../lib/tts';

interface Props {
  scenario: Scenario | null;
  error: string;
  starting: boolean;
  onStart: (mode: 5 | 10, difficulty: 'basic' | 'pressure') => void;
}

const STEP_NARRATION = [
  '오늘 하루, 클라우드밋의 신입 개발자가 됩니다. 어떤 하루를 보낼지 골라주세요.',
  '시작 전에 하나만 확인할게요. 영상은 이 거울 밖으로 나가지 않아요.',
  '준비됐어요. 출근해 볼까요?',
];

export default function OnboardingMirrorView({ scenario, error, starting, onStart }: Props) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<5 | 10>(5);
  const [difficulty, setDifficulty] = useState<'basic' | 'pressure'>('basic');

  useEffect(() => {
    speak(STEP_NARRATION[step], { rate: 1.05 });
    return stopSpeaking;
  }, [step]);

  const episodeCount = (m: 5 | 10) => scenario?.episode_titles[String(m)]?.length ?? (m === 5 ? 3 : 5);

  return (
    <div className="mirror-onboarding">
      {error && <div className="mirror-notice">{error}</div>}

      {step === 0 && (
        <>
          <p className="mirror-ob-eyebrow">㈜클라우드밋 · 입사 첫날</p>
          <h1 className="mirror-ob-title">어떤 하루로 할까요?</h1>
          <div className="mirror-ob-cards">
            <button
              className="mirror-ob-card"
              onClick={() => {
                setMode(5);
                setStep(1);
              }}
            >
              <strong>핵심으로 5분</strong>
              <span>출근 · 장애 대응 · 보고까지 {episodeCount(5)}개 상황</span>
            </button>
            <button
              className="mirror-ob-card"
              onClick={() => {
                setMode(10);
                setStep(1);
              }}
            >
              <strong>하루 전체 10분</strong>
              <span>잔업 요청과 회식까지 {episodeCount(10)}개 상황</span>
            </button>
          </div>
          <div className="mirror-ob-difficulty">
            <button
              className={`mirror-ob-chip ${difficulty === 'basic' ? 'active' : ''}`}
              onClick={() => setDifficulty('basic')}
            >
              기본
            </button>
            <button
              className={`mirror-ob-chip ${difficulty === 'pressure' ? 'active' : ''}`}
              onClick={() => setDifficulty('pressure')}
            >
              압박 질문 포함
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="mirror-ob-eyebrow">시작 전 확인</p>
          <h1 className="mirror-ob-title">약속 세 가지</h1>
          <ul className="mirror-ob-consent">
            <li>마이크·카메라는 <strong>분석에만</strong> 실시간으로 쓰여요</li>
            <li>영상은 <strong>이 거울 밖으로 나가지 않아요</strong> — 지표만 계산돼요</li>
            <li>음성·텍스트는 리포트가 만들어지면 <strong>저장하지 않아요</strong></li>
          </ul>
          <button className="primary-btn mirror-start-btn" onClick={() => setStep(2)}>
            확인했어요, 동의합니다
          </button>
          <button className="mirror-finish-link" onClick={() => setStep(0)}>
            이전으로
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="mirror-ob-eyebrow">
            {mode}분 · {difficulty === 'pressure' ? '압박 포함' : '기본'} 난이도
          </p>
          <h1 className="mirror-ob-title">
            ㈜클라우드밋 플랫폼팀
            <br />
            오늘의 신입 — <span className="accent">당신</span>
          </h1>
          <p className="mirror-ob-scene">월요일 아침. 사원증이 처음으로 찍히는 날.</p>
          <button
            className="primary-btn mirror-start-btn"
            disabled={starting || !scenario}
            onClick={() => {
              stopSpeaking();
              onStart(mode, difficulty);
            }}
          >
            {starting ? '입장 중…' : '출근하기'}
          </button>
          <button className="mirror-finish-link" onClick={() => setStep(0)}>
            처음부터 다시 고르기
          </button>
        </>
      )}
    </div>
  );
}

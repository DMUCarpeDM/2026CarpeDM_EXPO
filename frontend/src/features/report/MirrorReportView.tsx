/** 미러 리포트 — 스크롤 없는 시상식 (기획서 §4.5).
 *
 * 0막(하루의 결말 — 수행도 분기의 정서적 마침표) → 1막(총점) → 2막(4-Fit)
 * → 마무리(QR + 체험 코드). 탭으로 진행하고, 상세 첨삭은 폰(웹 모드 리포트)이
 * 담당한다. QR은 로컬 라이브러리로 생성 — 외부 API 없음.
 */
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import type { Report } from '../../api/types';
import Avatar from '../../components/Avatar';
import { speak, stopSpeaking } from '../../lib/tts';
import RadarChart from './RadarChart';

interface Props {
  report: Report;
  code: string; // 체험 코드 (익명 연속성)
  displayScore: number; // 카운트업 중인 총점
  gradeLabel: string;
  characterName: (id: string) => string;
  onRetry: () => void; // 10초 재도전 (기존 F-RVLDIK)
  retryCountdown: number | null;
  onFinish: () => void; // 대기 화면으로
}

const FIT_ORDER = ['response', 'voice', 'eye', 'posture'] as const;

export default function MirrorReportView({
  report, code, displayScore, gradeLabel, characterName,
  onRetry, retryCountdown, onFinish,
}: Props) {
  const ending = report.day_ending;
  const acts = useMemo(() => {
    const list: string[] = [];
    if (ending?.text) list.push('ending');
    list.push('score', 'fits', 'takeaway');
    return list;
  }, [ending]);
  const [actIndex, setActIndex] = useState(0);
  const act = acts[actIndex];
  const [qrSvg, setQrSvg] = useState('');

  // QR — 폰에서 열리는 상세 리포트 주소. 전시장에서는 VITE_PUBLIC_ORIGIN으로
  // 미러 PC의 LAN 주소를 지정한다 (localhost QR은 폰에서 안 열린다).
  useEffect(() => {
    const origin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined) ?? window.location.origin;
    QRCode.toString(`${origin}/report/${report.session_id}`, {
      type: 'svg',
      margin: 1,
      color: { dark: '#f2f5ff', light: '#00000000' },
    })
      .then(setQrSvg)
      .catch(() => undefined);
  }, [report.session_id]);

  // 막마다 거울이 말한다
  useEffect(() => {
    if (act === 'ending' && ending?.text) speak(ending.text, { rate: 1.0, pitch: 0.85 });
    if (act === 'score' && report.headline && 'sentence' in report.headline) {
      speak(`오늘의 총점은 ${Math.round(report.total_score)}점. ${report.headline.sentence}`, { rate: 1.02 });
    }
    return stopSpeaking;
  }, [act, ending, report]);

  function advance() {
    stopSpeaking();
    setActIndex((i) => Math.min(i + 1, acts.length - 1));
  }

  const headline = 'sentence' in report.headline ? report.headline : null;

  return (
    <div className="mirror-report" onClick={act !== 'takeaway' ? advance : undefined}>
      {act === 'ending' && ending?.text && (
        <div className="mirror-report-act">
          <p className="mirror-ob-eyebrow">18:30 · 퇴근 무렵</p>
          <Avatar characterId={ending.character_id ?? ''} name={characterName(ending.character_id ?? '')} size={88} />
          <strong className="mirror-presence-name">{characterName(ending.character_id ?? '')}</strong>
          <p className="mirror-ending-text">“{ending.text}”</p>
          <span className={`mirror-ending-label ${ending.level}`}>{ending.label}</span>
          <p className="mirror-tap-hint">화면을 탭하면 결과가 나와요</p>
        </div>
      )}

      {act === 'score' && (
        <div className="mirror-report-act">
          <p className="mirror-ob-eyebrow">오늘의 4-Fit</p>
          <div className="mirror-score-ring">
            <svg viewBox="0 0 120 120" width="260" height="260">
              <circle cx="60" cy="60" r="52" className="gauge-track" />
              <circle
                cx="60" cy="60" r="52"
                className="gauge-value"
                strokeDasharray={`${(displayScore / 100) * 326.7} 326.7`}
              />
            </svg>
            <div className="mirror-score-center">
              <span className="mirror-score-number">{Math.round(displayScore)}</span>
              <span className="mirror-score-grade">{gradeLabel}</span>
            </div>
          </div>
          {report.percentile_top !== null && (
            <p className="mirror-percentile">오늘 체험자 상위 {report.percentile_top}%</p>
          )}
          {headline && <p className="mirror-headline">“{headline.sentence}”</p>}
          <p className="mirror-tap-hint">탭하면 항목별로 볼 수 있어요</p>
        </div>
      )}

      {act === 'fits' && (
        <div className="mirror-report-act">
          <p className="mirror-ob-eyebrow">항목별 코칭</p>
          <div className="mirror-radar">
            <RadarChart
              current={Object.fromEntries(
                FIT_ORDER.map((f) => [f, report.fit_scores[f]?.score ?? null]),
              )}
              previous={report.previous?.fit_scores ?? null}
            />
          </div>
          <ul className="mirror-fit-list">
            {FIT_ORDER.map((f) => {
              const fit = report.fit_scores[f];
              if (!fit) return null;
              return (
                <li key={f}>
                  <strong>{fit.label.split(' ')[0]}</strong>
                  <span>{fit.score !== null ? `${Math.round(fit.score)}점` : '미측정'}</span>
                  <p>{fit.summary}</p>
                </li>
              );
            })}
          </ul>
          <p className="mirror-tap-hint">탭하면 마무리로 넘어가요</p>
        </div>
      )}

      {act === 'takeaway' && (
        <div className="mirror-report-act takeaway">
          <p className="mirror-ob-eyebrow">오늘의 기록, 가져가세요</p>
          {qrSvg && (
            <div className="mirror-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          )}
          <p className="mirror-qr-caption">
            폰으로 스캔하면 <strong>문장 단위 첨삭 리포트</strong>를 볼 수 있어요
          </p>
          {code && (
            <p className="mirror-code">
              체험 코드 <strong>{code}</strong>
              <span>다음에 이 코드를 입력하면 오늘에 이어서 성장 추이를 볼 수 있어요</span>
            </p>
          )}
          <div className="mirror-takeaway-actions">
            <button className="primary-btn mirror-start-btn" onClick={onRetry}>
              {retryCountdown !== null ? `${retryCountdown}초 뒤 재도전…` : '한 번 더 도전하기'}
            </button>
            <button className="mirror-finish-link" onClick={onFinish}>
              오늘은 여기까지 (퇴근)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

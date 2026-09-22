import { voiceReason } from "../../lib/voiceCapture";
import "../../styles/voice-measurement.css";

const value = (metric, field, unit) => metric?.status === "measured" && Number.isFinite(metric[field])
  ? `${metric[field].toFixed(2)}${unit}` : voiceReason(metric?.reason);

function PitchChart({ pitch, duration }) {
  const points = pitch?.track || [];
  if (!points.length || !duration) return null;
  const min = Math.min(...points.map((p) => p.hz));
  const max = Math.max(...points.map((p) => p.hz));
  // 점으로 표시해 미측정 구간을 높낮이 선으로 연결하지 않는다.
  return <svg viewBox="0 0 360 150" role="img" aria-label="녹음 시간에 따른 목소리 높낮이. 점이 없는 구간은 미측정입니다.">
    {points.map((p, index) => <circle key={index} cx={12 + p.time / duration * 336} cy={138 - (p.hz - min) / Math.max(1, max - min) * 120} r="2" fill="currentColor" />)}
    <text x="12" y="148" fontSize="12">0초</text><text x="300" y="148" fontSize="12">{duration.toFixed(1)}초</text>
    <text x="12" y="12" fontSize="12">{max.toFixed(0)}Hz</text>
  </svg>;
}

export function VoiceMeasurements({ data }) {
  if (!data?.engine_version) return null;
  return <section className="voice-report" aria-labelledby="voice-report-title">
    <h2 id="voice-report-title">목소리 측정 기록</h2>
    <p>크기·속도·멈춤을 기록했어요. 평가 기준을 검증하는 단계라 음성 점수와 감점에는 반영하지 않아요.</p>
    {(data.turns || []).map((turn, index) => <details key={turn.turn_id}>
      <summary>{index + 1}번째 답변의 측정값</summary>
      <dl>
        <dt>기준 대비 크기</dt><dd>{value(turn.volume, "relative_db", "dB")}<br /><small>같은 마이크에서 평소 목소리와 비교한 녹음 크기예요.</small></dd>
        <dt>말하기 속도</dt><dd>{value(turn.speed, "syllables_per_second", "음절/초")}</dd>
        <dt>말 사이 멈춤</dt><dd>{turn.pauses?.status === "measured" ? `${turn.pauses.count}개 구간` : voiceReason(turn.pauses?.reason)}
          {(turn.pauses?.segments || []).map((pause) => <p key={pause.id}>{pause.start.toFixed(1)}~{pause.end.toFixed(1)}초 · {pause.duration_sec.toFixed(1)}초 멈춤</p>)}
          <small>자연스러운 쉼이 포함돼요. 불필요한 멈춤이라는 뜻은 아니에요.</small></dd>
        <dt>높낮이 참고값</dt><dd>{value(turn.pitch, "median_hz", "Hz (중앙값)")}
          {turn.pitch?.status === "measured" && <p>10~90백분위: {turn.pitch.p10_hz.toFixed(1)}~{turn.pitch.p90_hz.toFixed(1)}Hz</p>}
          <PitchChart pitch={turn.pitch} duration={turn.duration_sec} /></dd>
        <dt>발성 불규칙성</dt><dd>{turn.voice_irregularity?.status === "measured"
          ? turn.voice_irregularity.segments.map((s, i) => <p key={i}>{s.start.toFixed(1)}~{s.end.toFixed(1)}초 · jitter {s.jitter_local_pct.toFixed(2)}%, shimmer {s.shimmer_local_pct.toFixed(2)}%</p>)
          : voiceReason(turn.voice_irregularity?.reason)}<small>발성 주기의 참고 수치예요. 긴장이나 자신감을 판단하지 않아요.</small></dd>
      </dl>
    </details>)}
    {!data.turns?.length && <p>확인할 녹음이 없어요. 음성은 감점하지 않아요.</p>}
  </section>;
}

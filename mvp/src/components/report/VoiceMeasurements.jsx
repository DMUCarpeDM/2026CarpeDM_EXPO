import { voiceReason } from "../../lib/voiceCapture";
import { hasVoiceMeasurements } from "../../lib/reportFits";
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
  // 이전 보고서의 참고값은 보존하고, 새 분석은 요청한 측정 항목만 표시한다.
  const showReferences = !data.measurement_fields || data.measurement_fields.includes("pitch");
  return <section className="voice-report" aria-labelledby="voice-report-title">
    <h2 id="voice-report-title">내 말하기 돌아보기</h2>
    <p>{hasVoiceMeasurements(data) ? "녹음에서 확인한 말속도와 쉬어 간 구간을 정리했어요." : "이번 연습에서는 목소리 측정값을 확인하지 못했어요."} {data.score_status === "context_provisional" ? "대화 상황에 따라 평소보다 목소리가 얼마나 커졌는지만 참고했어요. 말속도와 멈춤, 음높이는 감점하지 않아요." : "이 기록은 말하기를 돌아보기 위한 자료이며 점수에는 반영하지 않아요."}</p>
    {(data.turns || []).map((turn, index) => <details key={turn.turn_id}>
      <summary>{index + 1}번째 답변 살펴보기</summary>
      <dl>
        <dt>목소리 크기</dt><dd>{value(turn.volume, "relative_db", "dB")}<br /><small>개인 기준 녹음이 있을 때만 평소보다 얼마나 크게 말했는지 비교해요.</small></dd>
        <dt>말하기 속도</dt><dd>{turn.speed?.status === "measured" && Number.isFinite(turn.speed.syllables_per_second) ? `1초에 한글 약 ${turn.speed.syllables_per_second.toFixed(1)}글자를 말했어요.` : voiceReason(turn.speed?.reason)}<br /><small>말소리가 있는 구간 기준이에요. 이 숫자만으로 빠르거나 느리다고 판단하지 않아요.</small></dd>
        <dt>말 사이 멈춤</dt><dd>{turn.pauses?.status === "measured" ? `말하다 잠깐 쉰 구간이 ${turn.pauses.count}번 있었어요.` : voiceReason(turn.pauses?.reason)}
          {(turn.pauses?.segments || []).map((pause) => <p key={pause.id}>답변 시작 {pause.start.toFixed(1)}초 뒤에 약 {pause.duration_sec.toFixed(1)}초 쉬었어요.</p>)}
          <small>자연스러운 쉼이 포함돼요. 불필요한 멈춤이라는 뜻은 아니에요.</small></dd>
        {showReferences && <><dt>목소리 높낮이</dt><dd>{value(turn.pitch, "median_hz", "Hz (중앙값)")}
          {turn.pitch?.status === "measured" && <p>대부분의 목소리가 나타난 높이 범위: {turn.pitch.p10_hz.toFixed(1)}~{turn.pitch.p90_hz.toFixed(1)}Hz</p>}
          <PitchChart pitch={turn.pitch} duration={turn.duration_sec} /></dd>
        <dt>목소리의 미세한 변화</dt><dd><p>소리의 주기와 크기가 조금씩 달라진 기록이에요. 긴장이나 자신감을 뜻하지 않아요.</p><details><summary>자세한 측정 수치 보기</summary>{turn.voice_irregularity?.status === "measured"
          ? turn.voice_irregularity.segments.map((s, i) => <p key={i}>{s.start.toFixed(1)}~{s.end.toFixed(1)}초 · jitter {s.jitter_local_pct.toFixed(2)}%, shimmer {s.shimmer_local_pct.toFixed(2)}%</p>)
          : voiceReason(turn.voice_irregularity?.reason)}</details></dd></>}
      </dl>
    </details>)}
    {!data.turns?.length && <p>확인할 녹음이 없어요. 음성은 감점하지 않아요.</p>}
  </section>;
}

import { IconGlyph } from "../ui/IconGlyph";
import { PersonaFace } from "../ui/PersonaFace";

// 얼굴 메시 + 상체 스켈레톤 트래킹 오버레이. 실시간 측정 중임을 보여주는 시각 효과예요.
// 카메라가 없을 때(silhouette)는 인물 실루엣과 스캔 라인까지 함께 그려 빈 화면을 채워요.
export function TrackingOverlay({ silhouette = false }) {
  const facePoints = [
    [50, 12], [42, 14], [58, 14], [35, 20], [65, 20], [31, 28], [69, 28], [30, 37], [70, 37],
    [32, 46], [68, 46], [37, 53], [63, 53], [44, 58], [56, 58], [50, 60],
    [40, 30], [60, 30], [37, 25], [63, 25], [43, 25], [57, 25],
    [50, 34], [46, 40], [54, 40], [50, 42],
    [43, 49], [57, 49], [50, 47], [50, 52],
  ];
  const faceLines = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10],
    [9, 11], [10, 12], [11, 13], [12, 14], [13, 15], [14, 15],
    [18, 16], [20, 16], [19, 17], [21, 17], [16, 22], [17, 22], [16, 23], [17, 24],
    [22, 23], [22, 24], [23, 25], [24, 25], [25, 28], [23, 26], [24, 27],
    [26, 28], [27, 28], [26, 29], [27, 29], [29, 15],
    [5, 16], [6, 17], [7, 23], [8, 24], [9, 26], [10, 27], [16, 17],
  ];
  return (
    <div className="tracking-zone" aria-hidden="true">
      <svg viewBox="0 0 100 132" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="track-scan-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(94, 234, 148, 0)" />
            <stop offset="0.5" stopColor="rgba(94, 234, 148, 0.55)" />
            <stop offset="1" stopColor="rgba(94, 234, 148, 0)" />
          </linearGradient>
          <linearGradient id="track-body-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(148, 178, 224, 0.34)" />
            <stop offset="1" stopColor="rgba(84, 108, 150, 0.1)" />
          </linearGradient>
        </defs>
        {silhouette && (
          <path
            className="track-silhouette"
            d="M 50 10 C 61 10 68 20 68 33 C 68 43 64 51 58 56 L 58 63 C 78 69 93 82 96 106 L 98 132 L 2 132 L 4 106 C 7 82 22 69 42 63 L 42 56 C 36 51 32 43 32 33 C 32 20 39 10 50 10 Z"
            fill="url(#track-body-fill)"
          />
        )}
        <g className="track-corners">
          <path d="M 22 6 h -9 v 9" />
          <path d="M 78 6 h 9 v 9" />
          <path d="M 22 66 h -9 v -9" />
          <path d="M 78 66 h 9 v -9" />
        </g>
        <g className="track-face">
          {faceLines.map(([a, b], index) => <line key={index} x1={facePoints[a][0]} y1={facePoints[a][1]} x2={facePoints[b][0]} y2={facePoints[b][1]} />)}
          {facePoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="0.85" />)}
        </g>
        {silhouette && <rect className="track-scan" x="16" y="0" width="68" height="1.4" rx="0.7" fill="url(#track-scan-fill)" />}
        <g className="track-skeleton">
          <line x1="50" y1="62" x2="50" y2="79" />
          <line x1="50" y1="79" x2="10" y2="93" />
          <line x1="50" y1="79" x2="90" y2="93" />
          <line x1="10" y1="93" x2="4" y2="120" />
          <line x1="90" y1="93" x2="96" y2="120" />
          <circle cx="50" cy="79" r="1.7" /><circle cx="10" cy="93" r="1.7" /><circle cx="90" cy="93" r="1.7" />
        </g>
        <path className="track-chest" d="M 10 93 C 32 107, 68 107, 90 93" />
      </svg>
    </div>
  );
}

export function ChatBubble({ children, ai = false, mine = false, name, time }) {
  if (mine) {
    return (
      <div className="chat-message mine">
        <span className="chat-meta">나 · {time}</span>
        <div className="chat-bubble">
          <span className="bubble-speaker" aria-hidden="true"><IconGlyph icon="response" size={14} /></span>
          <p>{children}</p>
          <span className="bubble-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </div>
      </div>
    );
  }
  return (
    <div className={`chat-message ${ai ? "ai" : ""}`}>
      <span className="chat-avatar" aria-hidden="true"><PersonaFace name={name} /></span>
      <div className="chat-content">
        <span className="chat-meta">{name} · {time}</span>
        <div className="chat-bubble"><p>{children}</p></div>
      </div>
    </div>
  );
}

export function AiPromptOverlay({ name, speaking, text }) {
  return <section className={`ai-prompt-overlay ${speaking ? "is-speaking" : ""}`} aria-label={`${name}의 질문`}>
    <div className="ai-prompt-meta">
      <span className="ai-prompt-avatar" aria-hidden="true"><PersonaFace name={name} /></span>
      <strong>{name}</strong>
      <em>{speaking ? "AI가 말하는 중" : "AI 질문"}</em>
    </div>
    <p><b aria-hidden="true">“</b>{text}<b aria-hidden="true">”</b></p>
    <span className="ai-prompt-wave" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} />)}</span>
  </section>;
}

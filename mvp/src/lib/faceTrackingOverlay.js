// 얼굴 메시 표시용 랜드마크 (Face Mesh 468점 중 표정을 잘 드러내는 서브셋)
const FACE_DOTS = [
  10, 338, 297, 67, 109, // 이마 라인
  234, 454, 93, 323, 132, 361, 58, 288, 172, 397, // 볼·턱 옆 라인
  152, 148, 377, // 턱 끝
  33, 133, 159, 145, 362, 263, 386, 374, // 눈 둘레
  70, 105, 107, 336, 334, 300, // 눈썹
  1, 4, 168, 197, // 콧대·코끝
  61, 291, 13, 14, 78, 308, // 입술
];
// 얼굴 연결선 (안정적인 쌍만 — 과밀하지 않게)
const FACE_LINKS = [
  [10, 338], [10, 67], [338, 297], [67, 109], // 이마
  [234, 132], [132, 58], [58, 172], [172, 152], // 왼 턱 라인
  [454, 361], [361, 288], [288, 397], [397, 152], // 오른 턱 라인
  [70, 105], [105, 107], [336, 334], [334, 300], // 눈썹
  [33, 159], [159, 133], [133, 145], [145, 33], // 왼눈 다이아
  [362, 386], [386, 263], [263, 374], [374, 362], // 오른눈 다이아
  [168, 197], [197, 4], // 콧대
  [4, 61], [4, 291], // 코→입꼬리
  [61, 13], [13, 291], [61, 14], [14, 291], // 입술
  [107, 168], [336, 168], // 미간
  [234, 70], [454, 300], // 볼→눈썹
];
// 상체 포즈 연결선 (BlazePose): 어깨-팔꿈치-몸통
const POSE_LINKS = [
  [11, 12], [11, 13], [12, 14], [11, 23], [12, 24], [23, 24],
];

// 손목부터 손가락 끝까지의 Hand Landmarker 21점 연결선
const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** 분석 시각화 오버레이 — 영상은 canvas에 그리지 않고 상반신·손 랜드마크만 그린다.
 *  비디오가 object-fit: cover로 크롭되므로 같은 크롭 좌표계로 사상한다.
 *  좌우 반전은 canvas 자체를 CSS로 미러링해 비디오와 정확히 일치시킨다. */
export function drawOverlay(canvas, video, faceLm, poseLm, handLm = []) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  const { width: cw, height: ch } = canvas;
  ctx.clearRect(0, 0, cw, ch);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(cw / vw, ch / vh);
  const dx = (cw - vw * scale) / 2;
  const dy = (ch - vh * scale) / 2;
  const px = (p) => [p.x * vw * scale + dx, p.y * vh * scale + dy];

  // 상체·손·얼굴은 같은 초록색 연결선과 도트 색상을 사용한다.
  if (poseLm) {
    ctx.lineCap = "round";
    for (const [a, b] of POSE_LINKS) {
      const pa = poseLm[a];
      const pb = poseLm[b];
      if (!pa || !pb || (pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.strokeStyle = "rgba(94, 234, 148, 0.35)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    const sl = poseLm[11];
    const sr = poseLm[12];
    if (sl && sr && (sl.visibility ?? 1) > 0.4 && (sr.visibility ?? 1) > 0.4) {
      const [lx, ly] = px(sl);
      const [rx, ry] = px(sr);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo((lx + rx) / 2, Math.max(ly, ry) + Math.abs(rx - lx) * 0.22, rx, ry);
      ctx.strokeStyle = "rgba(94, 234, 148, 0.35)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = "rgba(134, 245, 182, 0.95)";
      for (const index of new Set(POSE_LINKS.flat())) {
        const point = poseLm[index];
        if (!point || (point.visibility ?? 1) < 0.4) continue;
        const [x, y] = px(point);
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 손 관절 21점과 연결선 — 손동작은 자세 분석에 쓰되, 하체 포즈는 표시하지 않는다.
  for (const hand of handLm) {
    ctx.strokeStyle = "rgba(94, 234, 148, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.lineCap = "round";
    for (const [a, b] of HAND_LINKS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(134, 245, 182, 0.95)";
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(...px(point), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 얼굴 메시 (초록)
  if (faceLm) {
    ctx.strokeStyle = "rgba(94, 234, 148, 0.35)";
    ctx.lineWidth = 1.1;
    for (const [a, b] of FACE_LINKS) {
      const pa = faceLm[a];
      const pb = faceLm[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(134, 245, 182, 0.95)";
    ctx.shadowColor = "rgba(94, 234, 148, 0.8)";
    ctx.shadowBlur = 2;
    for (const idx of FACE_DOTS) {
      const p = faceLm[idx];
      if (!p) continue;
      const [x, y] = px(p);
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

  }
}

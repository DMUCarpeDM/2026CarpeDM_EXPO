/** 분석 시각화 HUD — 영상은 canvas에 그리지 않고 계측 오버레이만 그린다.
 *
 * useFaceTracking 훅에서 분리한 순수 모듈이다(node --test 대상). 그리기는 추론
 * 루프의 try 안에서 돌기 때문에, 여기서 예외가 나면 그 프레임의 턴 집계까지
 * 조용히 멈춘다 — 그래서 무예외성을 overlayHud.test.js가 고정한다.
 *
 * 비디오가 object-fit: cover로 크롭되므로 같은 크롭 좌표계로 사상한다.
 * 좌우 반전은 canvas 자체를 CSS(scaleX(-1))로 미러링해 비디오와 일치시킨다.
 * 표시 수치는 전부 파이프라인 실측값이다(hud) — 연출용 숫자를 발명하지 않는다.
 */

// 이목구비 강조 윤곽 (테셀레이션 위에 겹쳐 눈·코·입을 또렷하게)
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

// 계측 HUD 팔레트 — 화면 칩 색(good #6ee7a0 · warn #fca55f · pending #93c5fd)과 정렬
const HUD = {
  mesh: "rgba(147, 197, 253, 0.13)", // 468점 테셀레이션 — 배경처럼 은은하게
  contour: "rgba(191, 219, 254, 0.4)",
  hair: "rgba(255, 255, 255, 0.3)", // 기준선·박스용 헤어라인
  accent: "rgba(96, 165, 250, 0.9)",
  frame: "rgba(203, 213, 225, 0.8)",
  framePending: "rgba(147, 197, 253, 0.9)",
  frameWarn: "rgba(252, 165, 95, 0.92)",
  good: "#6ee7a0",
  warn: "#fca55f",
  pending: "#93c5fd",
  text: "rgba(226, 236, 255, 0.92)",
  textDim: "rgba(178, 198, 228, 0.66)",
};
const HUD_FONT = '600 10.5px ui-monospace, "Cascadia Mono", Consolas, monospace';

// 눈 계측 박스: [눈꼬리 바깥·안쪽, 윗눈꺼풀, 아랫눈꺼풀] + 홍채 중심 —
// useFaceTracking의 시선 판정(IRIS_R/L·EYE_R/L)과 같은 랜드마크를 본다
const EYE_BOXES = [
  { corners: [33, 133, 159, 145], iris: 468 },
  { corners: [362, 263, 386, 374], iris: 473 },
];

export function drawOverlay(canvas, video, faceLm, poseLm, hud = {}) {
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
  // PIP처럼 작은 캔버스에서는 글자·게이지를 생략한다 — 읽을 수 없는 밀도는 소음이다
  const compact = cw < 430;
  // 캔버스가 CSS scaleX(-1)로 미러링되므로 fillText를 그대로 쓰면 글자가 뒤집힌다.
  // 화면 좌표계(화면 x = cw - 캔버스 x)로 한 번 더 뒤집은 상태에서 그려 바로 보이게 한다.
  const sx = (x) => cw - x;
  const text = (str, screenX, y, { align = "left", color = HUD.text } = {}) => {
    ctx.save();
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.font = HUD_FONT;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, screenX, y);
    ctx.restore();
  };

  // ---- 상체: 스켈레톤 + 어깨 수평 계측 + 신체 중심선 ----
  if (poseLm) {
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.lineWidth = 1.6;
    for (const [a, b] of POSE_LINKS) {
      const pa = poseLm[a];
      const pb = poseLm[b];
      if (!pa || !pb || (pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
      ctx.stroke();
    }
    const sl = poseLm[11];
    const sr = poseLm[12];
    const nose = poseLm[0];
    if (sl && sr && (sl.visibility ?? 1) > 0.4 && (sr.visibility ?? 1) > 0.4) {
      const [lx, ly] = px(sl);
      const [rx, ry] = px(sr);
      const midX = (lx + rx) / 2;
      const midY = (ly + ry) / 2;
      const span = Math.hypot(rx - lx, ry - ly);
      // 수평 기준선 + 신체 중심선 — 어깨 실선과 기준선의 벌어짐이 곧 기울기 각도다
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = HUD.hair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(midX - span * 0.62, midY);
      ctx.lineTo(midX + span * 0.62, midY);
      ctx.moveTo(midX, midY + span * 0.5);
      ctx.lineTo(midX, midY - span * 0.95);
      ctx.stroke();
      ctx.setLineDash([]);
      // 코 위치 틱 — 중심선 대비 좌우 치우침(흔들림)이 그대로 보인다
      if (nose && (nose.visibility ?? 1) > 0.4) {
        const [nx] = px(nose);
        ctx.strokeStyle = HUD.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nx, midY - 5);
        ctx.lineTo(nx, midY + 5);
        ctx.stroke();
      }
      // 어깨 실선 + 가슴 곡선 (디자인 시안의 표현 유지)
      ctx.strokeStyle = HUD.accent;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = "rgba(96, 165, 250, 0.55)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(midX, Math.max(ly, ry) + Math.abs(rx - lx) * 0.22, rx, ry);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      for (const [x, y] of [[lx, ly], [rx, ry]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 기울기 수치 — 개인 기준 보정 후 값(턴 집계에 들어가는 바로 그 값)
      if (!compact && hud.tiltAdj !== null && hud.tiltAdj !== undefined) {
        const ok = Boolean(hud.postureLevel);
        text(`어깨 ${hud.tiltAdj.toFixed(1)}°${hud.worldUsed ? " · 3D" : ""}`, sx(midX), midY + 22,
          { align: "center", color: ok ? HUD.good : HUD.warn });
      }
    }
  }

  // ---- 얼굴: 468점 메시 + 홍채 계측 + 상태 프레임 ----
  if (faceLm) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of faceLm) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    // 테셀레이션 전체 — '분석 중인 표면'을 그대로 보여준다. 한 패스로 모아 그린다.
    if (hud.tess && faceLm.length >= 468) {
      ctx.strokeStyle = HUD.mesh;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const edge of hud.tess) {
        const pa = faceLm[edge.start ?? edge[0]];
        const pb = faceLm[edge.end ?? edge[1]];
        if (!pa || !pb) continue;
        ctx.moveTo(...px(pa));
        ctx.lineTo(...px(pb));
      }
      ctx.stroke();
    }
    // 이목구비 강조 윤곽
    ctx.strokeStyle = HUD.contour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of FACE_LINKS) {
      const pa = faceLm[a];
      const pb = faceLm[b];
      if (!pa || !pb) continue;
      ctx.moveTo(...px(pa));
      ctx.lineTo(...px(pb));
    }
    ctx.stroke();

    // 눈 계측 박스 + 홍채 십자선 + 홍채 수평 위치 게이지 — 시선 판정의 실제 입력값
    if (faceLm.length > 477) {
      for (const spec of EYE_BOXES) {
        const pts = spec.corners.map((idx) => faceLm[idx]);
        if (pts.some((p) => !p)) continue;
        let ex1 = Infinity;
        let ey1 = Infinity;
        let ex2 = -Infinity;
        let ey2 = -Infinity;
        for (const p of pts) {
          const [x, y] = px(p);
          if (x < ex1) ex1 = x;
          if (y < ey1) ey1 = y;
          if (x > ex2) ex2 = x;
          if (y > ey2) ey2 = y;
        }
        const w = ex2 - ex1;
        if (w < 5) continue; // 너무 멀어 눈이 몇 픽셀이면 계측 표시가 무의미하다
        const padX = w * 0.24;
        const padY = Math.max((ey2 - ey1) * 0.8, w * 0.22);
        ctx.strokeStyle = HUD.hair;
        ctx.lineWidth = 1;
        ctx.strokeRect(ex1 - padX, ey1 - padY, w + padX * 2, (ey2 - ey1) + padY * 2);
        const [ix, iy] = px(faceLm[spec.iris]);
        ctx.strokeStyle = HUD.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ix - 4.5, iy);
        ctx.lineTo(ix + 4.5, iy);
        ctx.moveTo(ix, iy - 4.5);
        ctx.lineTo(ix, iy + 4.5);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(ix, iy, 2.6, 0, Math.PI * 2);
        ctx.stroke();
        if (!compact) {
          const gy = ey2 + padY + 5;
          const ratio = Math.min(1, Math.max(0, (ix - ex1) / w));
          ctx.strokeStyle = HUD.hair;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ex1 - padX, gy);
          ctx.lineTo(ex2 + padX, gy);
          ctx.stroke();
          ctx.strokeStyle = HUD.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ex1 + ratio * w, gy - 3);
          ctx.lineTo(ex1 + ratio * w, gy + 3);
          ctx.stroke();
        }
      }
    }

    // 상태 프레임(코너 브래킷) — 기준 수집 중=파랑 · 시선 이탈=주황 · 정상=중립
    const pad = 0.06;
    const [bx1, by1] = px({ x: minX - pad, y: minY - pad * 1.4 });
    const [bx2, by2] = px({ x: maxX + pad, y: maxY + pad * 0.8 });
    const arm = Math.min(22, (bx2 - bx1) * 0.16);
    const frameColor = hud.calibrating ? HUD.framePending
      : hud.eyeFront === false ? HUD.frameWarn : HUD.frame;
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 2;
    const corners = [
      [bx1, by1, arm, 0, 0, arm], [bx2, by1, -arm, 0, 0, arm],
      [bx1, by2, arm, 0, 0, -arm], [bx2, by2, -arm, 0, 0, -arm],
    ];
    for (const [x, y, ax, ay, bxo, byo] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + ax, y + ay);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bxo, y + byo);
      ctx.stroke();
    }
    // 기준 수집 진행 바 — 브래킷 상단을 왼쪽부터 채운다 (화면 기준)
    if (hud.calibrating && hud.calibTotal) {
      const progress = Math.min(1, (hud.calibCount || 0) / hud.calibTotal);
      ctx.strokeStyle = HUD.pending;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx2, by1);
      ctx.lineTo(bx2 - (bx2 - bx1) * progress, by1);
      ctx.stroke();
    }

    // 라벨 — 실측 상태만 적는다. 브래킷이 화면 밖에 닿으면 안쪽으로 밀어 넣는다.
    if (!compact) {
      const topY = by1 > 26 ? by1 - 9 : by1 + 18;
      const bottomY = by2 + 16 < ch - 6 ? by2 + 16 : by2 - 10;
      text(`FACE ${faceLm.length}pt · ${Math.max(1, Math.round(hud.inferMs || 0))}ms`,
        sx(bx2), topY, { color: HUD.textDim });
      const [gazeLabel, gazeColor] = hud.calibrating
        ? [`기준 수집 ${Math.min(hud.calibCount || 0, hud.calibTotal || 0)}/${hud.calibTotal || 0}`, HUD.pending]
        : hud.eyeFront === false ? ["시선 이탈", HUD.warn] : ["시선 정면", HUD.good];
      text(gazeLabel, sx(bx1), topY, { align: "right", color: gazeColor });
      text(`머리 ${Math.round(hud.rollDeg || 0)}°`, sx(bx1), bottomY, { align: "right", color: HUD.textDim });
      if (hud.headDown) text("고개 숙임", sx(bx2), bottomY, { color: HUD.warn });
    }
  }
}

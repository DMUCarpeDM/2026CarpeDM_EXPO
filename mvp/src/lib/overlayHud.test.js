/** drawOverlay 스모크 회귀 — 실제 캔버스 없이 ctx 스텁으로 전 분기를 실행한다.
 *
 * 오버레이 그리기는 추론 루프의 try 안에서 돌기 때문에, 여기서 예외가 나면
 * 화면만 죽는 게 아니라 그 프레임의 턴 집계(accumulateSample)까지 조용히
 * 멈춘다. 그래서 그리기 코드의 무예외성을 회귀로 고정한다. 픽셀 결과는
 * 검증하지 않는다 — 미러 텍스트 보정(translate+scale(-1,1))과 라벨 유무 같은
 * 구조적 사실만 확인한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawOverlay } from "./overlayHud.js";

function makeCanvas(width, height) {
  const calls = [];
  const ctx = {};
  for (const m of ["save", "restore", "translate", "scale", "beginPath", "moveTo", "lineTo",
    "stroke", "strokeRect", "arc", "fill", "fillText", "clearRect", "setLineDash", "quadraticCurveTo"]) {
    ctx[m] = (...args) => { calls.push({ m, args }); };
  }
  const canvas = { clientWidth: width, clientHeight: height, width: 0, height: 0, getContext: () => ctx };
  const texts = () => calls.filter((c) => c.m === "fillText").map((c) => String(c.args[0]));
  const count = (m) => calls.filter((c) => c.m === m).length;
  return { canvas, calls, texts, count };
}

const VIDEO = { videoWidth: 1280, videoHeight: 720 };

// 478점 합성 얼굴 — 시선 계측에 쓰이는 핵심 인덱스(눈꼬리·눈꺼풀·홍채)만
// 해부학적 위치에 두고, 나머지는 동심 타원 위에 배치한다(테셀레이션 경로 실행용)
function syntheticFace(length = 478) {
  const lm = Array.from({ length }, (_, i) => {
    const angle = (i / 478) * Math.PI * 2;
    const ring = 0.4 + (i % 5) * 0.15;
    return { x: 0.5 + Math.cos(angle) * 0.16 * ring, y: 0.42 + Math.sin(angle) * 0.22 * ring };
  });
  const put = (idx, x, y) => { if (idx < length) lm[idx] = { x, y }; };
  put(33, 0.385, 0.38); put(133, 0.455, 0.38); put(159, 0.42, 0.368); put(145, 0.42, 0.392);
  put(362, 0.545, 0.38); put(263, 0.615, 0.38); put(386, 0.58, 0.368); put(374, 0.58, 0.392);
  put(468, 0.425, 0.379); put(473, 0.585, 0.379);
  return lm;
}

function syntheticPose() {
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0 }));
  const put = (idx, x, y) => { pose[idx] = { x, y, visibility: 1 }; };
  put(0, 0.5, 0.42); put(11, 0.3, 0.7); put(12, 0.7, 0.69);
  put(13, 0.24, 0.86); put(14, 0.76, 0.85); put(23, 0.36, 0.98); put(24, 0.64, 0.98);
  return pose;
}

// 실제 테셀레이션은 {start,end} 객체지만 방어적으로 [a,b] 배열도 받는다 — 둘 다 섞어 검증
const TESS = [
  ...Array.from({ length: 40 }, (_, i) => ({ start: i, end: (i * 7 + 13) % 468 })),
  ...Array.from({ length: 20 }, (_, i) => [i + 40, (i * 11 + 3) % 468]),
];

const HUD_FULL = {
  tess: TESS, rollDeg: 3.2, tiltAdj: 2.4, postureLevel: true, worldUsed: true,
  headDown: true, eyeFront: true, calibrating: false, calibCount: 24, calibTotal: 24, inferMs: 34.2,
};

test("큰 캔버스: 전 요소가 예외 없이 그려지고 실측 라벨이 전부 뜬다", () => {
  const { canvas, calls, texts, count } = makeCanvas(720, 900);
  drawOverlay(canvas, VIDEO, syntheticFace(), syntheticPose(), HUD_FULL);
  const labels = texts();
  for (const expected of ["FACE 478pt", "시선 정면", "머리 3°", "어깨 2.4° · 3D", "고개 숙임"]) {
    assert.ok(labels.some((t) => t.includes(expected)), `라벨 누락: ${expected} (실제: ${labels})`);
  }
  // 캔버스가 CSS로 미러링되므로 모든 텍스트는 translate(cw,0)+scale(-1,1) 안에서 그려야 한다
  const scales = calls.filter((c) => c.m === "scale");
  assert.equal(scales.length, count("fillText"), "scale은 텍스트 보정에서만 쓰인다");
  for (const c of scales) assert.deepEqual(c.args, [-1, 1]);
  for (const c of calls.filter((x) => x.m === "translate")) assert.deepEqual(c.args, [720, 0]);
  // 테셀레이션 60간선 + 윤곽 + 스켈레톤이 실제로 그려졌다
  assert.ok(count("moveTo") > 80, `선 분량 부족: moveTo ${count("moveTo")}`);
  assert.ok(count("strokeRect") === 2, "눈 계측 박스 2개");
});

test("PIP(compact) 캔버스: 글자·게이지 없이 구조만 그린다", () => {
  const { canvas, count } = makeCanvas(300, 375);
  drawOverlay(canvas, VIDEO, syntheticFace(), syntheticPose(), HUD_FULL);
  assert.equal(count("fillText"), 0, "작은 캔버스에는 텍스트를 그리지 않는다");
  assert.ok(count("stroke") > 5, "메시·브래킷은 유지");
});

test("기준 수집 중: 진행 라벨이 뜨고, 어깨 미측정(null)이면 각도 라벨은 생략", () => {
  const { canvas, texts } = makeCanvas(720, 900);
  drawOverlay(canvas, VIDEO, syntheticFace(), syntheticPose(), {
    ...HUD_FULL, calibrating: true, calibCount: 13, tiltAdj: null, headDown: false,
  });
  const labels = texts();
  assert.ok(labels.some((t) => t.includes("기준 수집 13/24")), `수집 라벨 누락: ${labels}`);
  assert.ok(!labels.some((t) => t.includes("어깨")), "기준 없는 어깨 각도는 표시하지 않는다");
  assert.ok(!labels.some((t) => t.includes("고개 숙임")), "고개 숙임 미판정이면 라벨 없음");
});

test("홍채 없는 468점 결과·랜드마크 부재·영상 0크기에서도 조용히 넘어간다", () => {
  const iris478 = makeCanvas(720, 900);
  drawOverlay(iris478.canvas, VIDEO, syntheticFace(468), syntheticPose(), HUD_FULL);
  assert.equal(iris478.count("strokeRect"), 0, "홍채가 없으면 눈 계측 박스도 없다");

  const empty = makeCanvas(720, 900);
  drawOverlay(empty.canvas, VIDEO, undefined, undefined, {});
  assert.equal(empty.count("clearRect"), 1);
  assert.equal(empty.count("fillText"), 0);

  const zero = makeCanvas(720, 900);
  drawOverlay(zero.canvas, { videoWidth: 0, videoHeight: 0 }, syntheticFace(), syntheticPose(), HUD_FULL);
  assert.equal(zero.count("stroke"), 0, "영상 크기를 모르면 사상 불가 — 그리지 않는다");
});

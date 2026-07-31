"""관절 시계열 → 동작(모션) 지표. 순수 numpy라 하드웨어 없이 테스트한다.

`geometry.py`가 **한 프레임의 자세**(각도·거리)를 재는 반면, 여기서는 **여러
프레임에 걸친 움직임**을 잰다: 손이 얼마나 크게·빠르게 움직였는지, 고개를
끄덕였는지, 체중이 좌우로 옮겨 다녔는지.

왜 필요한가 — 전시 경로의 실제 공백:
    전시 프론트(mvp)는 MediaPipe **FaceLandmarker만** 돌린다. 얼굴 밖의 몸은
    아예 보지 못하므로 `gesture_energy`·`nod_count`·`hand_face_sec` 같은
    스키마 필드가 전시 경로에서는 늘 비어 있었다(레거시 poc/frontend에만
    PoseLandmarker 경로가 있다). 키넥트는 32관절을 이미 받고 있으면서 어깨
    3개 축만 쓰고 나머지를 버리고 있었다 — 이 모듈이 그 관절을 소비한다.

측정 정책 (docs/kinect/04 §3 "밴드 발명 금지"의 모션판):
  - 여기서 나오는 값은 **전부 관찰 지표**다. 채점 밴드를 붙이지 않는다.
    리포트 관찰 문장·압박 대비 교차 분석에만 쓰인다.
  - 정의는 기존 브라우저 생산자(`poc/frontend/.../nonverbalCore.ts`)와 **같은
    식**을 쓴다: 끄덕임 진폭 게이트(어깨너비 4%)·지터 eps·제스처 활동
    임계(0.1 m/s)·양손 비율의 분모까지 맞췄다. 같은 이름의 값이 같은 리포트
    문장으로 들어가므로, 두 생산자의 정의가 다르면 폴백 전환에서 문장이 뒤집힌다.
  - 뎁스에만 있는 임계(손-얼굴 접근 mm)는 발명이 아니라 물리 거리지만, 실기기
    보정 항목이다 (poc/docs/demo-checklist.md §2.5).

평활 정책 (여기가 제일 미묘하다):
  - **채점에 들어가는 값은 평활하지 않는다.** EMA·이동평균은 표준편차를 줄인다.
    `posture_sway`를 평활하면 밴드는 그대로인데 입력 분포만 조용히 좋아져서
    흔들림 점수가 공짜로 오른다 — 가장 나쁜 종류의 변경이다.
  - 대신 **글리치 프레임을 버린다**(`is_torso_glitch`). 한 프레임 만에 사람이
    갈 수 없는 거리를 이동한 표본은 사람의 움직임이 아니라 추적 실패나 대상
    뒤바뀜이다. 평활이 아니라 표본 제외라서 밴드의 의미가 보존된다.
  - 속도(제스처 에너지)는 위치의 미분이라 지터가 그대로 증폭된다. 그래서 모션
    지표 **안에서만** 중앙값 3점 필터를 쓴다 — 이 값들은 점수에 들어가지 않는다.
"""
from __future__ import annotations

from collections import deque

import numpy as np

from app.kinect.k4a import JOINT

# ---------------------------------------------------------------------------
# 임계값 — 출처를 반드시 남긴다
# ---------------------------------------------------------------------------

# [브라우저 생산자와 동일] 손목이 이보다 빠르면 '제스처 중'
GESTURE_ACTIVE_MS = 0.1
# [브라우저 생산자와 동일] 끄덕임 진폭 게이트 — 어깨너비 대비 비율
NOD_MIN_SWING = 0.04
NOD_JITTER_EPS = 0.005  # 이보다 작은 표본 간 변화는 방향 판정에 쓰지 않는다
# [뎁스 신규] 반전 사이가 이보다 길면 끄덕임이 아니라 자세가 서서히 바뀐 것이다.
# 2D 경로에는 없던 게이트 — 뎁스는 30fps 연속이라 느린 드리프트까지 잡히기 때문.
NOD_MAX_SWING_SEC = 2.0
# [뎁스 신규 · 실기기 보정 항목] 손목-머리중심 거리가 이 아래면 손이 얼굴 근처.
# 머리 관절은 머리 '중심'이라 턱·입을 만지면 대략 이 거리가 된다.
HAND_FACE_MM = 250.0
# [뎁스 신규] 몸통이 이 속도를 넘으면 사람의 움직임이 아니다 (추적 실패·대상 뒤바뀜).
# 거울 앞에 선 사람의 가슴은 4 m/s로 이동하지 않는다.
GLITCH_TORSO_SPEED_MMS = 4000.0

MOTION_WINDOW_SEC = 4.0  # 롤링 창 — 서비스가 순간값을 내보내고 턴 집계는 브라우저가 한다
MIN_MOTION_SAMPLES = 8  # 이 미만이면 창 지표를 만들지 않는다 (측정 보류)
MIN_SPEED_PAIRS = 4  # 속도는 인접쌍이 재료 — 표본이 이보다 적으면 보류

_WRISTS = (JOINT["WRIST_LEFT"], JOINT["WRIST_RIGHT"])
_SHOULDERS = (JOINT["SHOULDER_LEFT"], JOINT["SHOULDER_RIGHT"])
_KNEES = (JOINT["KNEE_LEFT"], JOINT["KNEE_RIGHT"])
_HEAD = JOINT["HEAD"]
_PELVIS = JOINT["PELVIS"]
_CHEST = JOINT["SPINE_CHEST"]


def is_torso_glitch(prev_chest_mm, chest_mm, dt_sec: float) -> bool:
    """직전 프레임 대비 몸통이 물리적으로 불가능하게 튀었는가.

    True면 그 프레임은 **모든 지표에서 제외**해야 한다 (평활이 아니라 제외).
    dt가 0 이하거나 표본이 없으면 판정하지 않는다(False) — 판정 불가를
    '이상 있음'으로 바꾸면 정상 프레임까지 버리게 된다.
    """
    if prev_chest_mm is None or chest_mm is None or dt_sec <= 0:
        return False
    step = float(np.linalg.norm(np.asarray(chest_mm, dtype=float)
                                - np.asarray(prev_chest_mm, dtype=float)))
    return step / dt_sec > GLITCH_TORSO_SPEED_MMS


def _median3(values: np.ndarray) -> np.ndarray:
    """중앙값 3점 필터 — 단발 스파이크만 죽이고 추세는 남긴다.

    (N,) 또는 (N, 3) 모두 처리한다. 표본 3개 미만이면 그대로 돌려준다.
    """
    arr = np.asarray(values, dtype=float)
    if arr.shape[0] < 3:
        return arr
    stacked = np.stack([arr[:-2], arr[1:-1], arr[2:]])
    middle = np.median(stacked, axis=0)
    # 양 끝은 이웃이 한쪽뿐이라 원본을 유지한다 (앞뒤로 값을 지어내지 않는다)
    return np.concatenate([arr[:1], middle, arr[-1:]])


class BodyLock:
    """추적 대상 한 명을 프레임 사이에 고정한다 (히스테리시스).

    `nearest_body()`는 프레임마다 '가장 가까운 사람'을 **다시** 고른다. 부스에
    두 사람이 비슷한 거리에 서면 대상이 프레임마다 튀고, 그러면 흔들림·거리
    드리프트가 사람의 움직임이 아니라 **두 사람의 차이**로 채워진다. 전시장에서
    실제로 일어나는 상황이라(관람객이 뒤에서 들여다본다) 측정 신뢰의 문제다.

    규칙:
      - 잠긴 id가 이번 프레임에도 후보 안에 있으면 유지한다.
      - 다른 사람이 더 가깝더라도 `LEAD_MM` 이상 확실히 가깝지 않으면 뺏기지 않는다
        (경계에서의 깜빡임 방지).
      - 잠긴 사람이 사라지면 `GRACE_SEC` 동안 기다린다 — 한두 프레임 관측 실패는 흔하다.
      - 유예가 끝나면 가장 가까운 사람으로 새로 잠그고 `switches`를 올린다.
        이 카운터는 측정 투명성 지표다 (MediaPipe 경로의 guard_dropped_frames와 같은 역할).
    """

    GRACE_SEC = 1.0
    LEAD_MM = 150.0

    def __init__(self) -> None:
        self.body_id: int | None = None
        self.switches = 0  # 추적 대상이 실제로 바뀐 횟수 (최초 획득은 세지 않는다)
        self._lost_since: float | None = None

    def select(self, candidates: list, now_sec: float):
        """유효 거리 필터를 이미 통과한 후보들 중 추적 대상 하나를 고른다.

        candidates: `nearest_body()`와 같은 필터를 통과한 Body 목록 (빈 목록 가능).
        반환 None은 '이번 프레임은 측정하지 않는다'는 뜻이다.
        """
        if not candidates:
            if self.body_id is not None:
                if self._lost_since is None:
                    self._lost_since = now_sec
                elif now_sec - self._lost_since > self.GRACE_SEC:
                    self.body_id = None  # 유예 끝 — 다음 사람을 새로 잠글 수 있게 푼다
            return None

        nearest = min(candidates, key=lambda b: b.distance_mm)
        held = next((b for b in candidates if b.id == self.body_id), None)

        if held is not None:
            self._lost_since = None
            # 더 가까운 사람이 나타나도 확실한 차이가 아니면 뺏기지 않는다
            if held.distance_mm - nearest.distance_mm <= self.LEAD_MM:
                return held
            return self._lock(nearest)

        # 잠긴 사람이 이번 프레임에 없다 — 유예 안이면 새로 잠그지 않고 보류한다
        if self.body_id is not None:
            if self._lost_since is None:
                self._lost_since = now_sec
            if now_sec - self._lost_since <= self.GRACE_SEC:
                return None
        return self._lock(nearest)

    def _lock(self, body):
        if self.body_id is not None and self.body_id != body.id:
            self.switches += 1
        self.body_id = body.id
        self._lost_since = None
        return body


class MotionTracker:
    """관절 프레임을 흘려 넣으면 롤링 창의 동작 지표를 내주는 누적기.

    서비스는 30Hz로 `update()`를 호출하고 `snapshot()`을 페이로드에 싣는다.
    턴 단위 집계는 브라우저(`mvp/src/lib/kinectMetrics.js`)가 한다 — 서비스는
    턴 경계를 모르기 때문이다. 그래서 이벤트 카운터(끄덕임·글리치)는 창이 아니라
    **단조 증가 누적값**으로 내보내고, 브라우저가 턴 시작·끝의 차이를 취한다.
    """

    def __init__(self, window_sec: float = MOTION_WINDOW_SEC) -> None:
        self.window_sec = window_sec
        self.glitch_frames = 0
        self._samples: deque[dict] = deque()
        # 끄덕임 상태 기계 (브라우저 updateNod와 같은 구조)
        self._reversals = 0
        self._nod_prev_gap: float | None = None
        self._nod_dir = 0
        self._nod_swing = 0.0
        self._nod_last_reversal_sec: float | None = None

    @property
    def nod_count(self) -> int:
        """반전 2회(내려갔다 올라옴)가 끄덕임 1회 — 브라우저와 같은 환산."""
        return self._reversals // 2

    # -- 입력 ---------------------------------------------------------------

    def update(self, t_sec: float, world_mm, observed, span_mm: float | None) -> None:
        """월드 좌표 관절 한 프레임을 누적한다.

        world_mm: (32, 3) 중력정렬 세계 좌표(mm) — `geometry.to_world()` 결과.
        observed: (32,) bool — MEDIUM 이상 신뢰도인 관절만 True.
                  LOW는 '가려져서 예측만 한' 값이라 움직임 지표에 쓰면 안 된다.
        span_mm:  어깨너비. 없으면 정규화 지표(끄덕임·체중 이동)는 건너뛴다.
        """
        joints = np.asarray(world_mm, dtype=float)
        seen = np.asarray(observed, dtype=bool)

        sample = {
            "t": float(t_sec),
            "span": float(span_mm) if span_mm else None,
            "head": joints[_HEAD] if seen[_HEAD] else None,
            "pelvis": joints[_PELVIS] if seen[_PELVIS] else None,
            "chest": joints[_CHEST] if seen[_CHEST] else None,
            "wrists": [joints[j] if seen[j] else None for j in _WRISTS],
            "shoulder_mid": (
                (joints[_SHOULDERS[0]] + joints[_SHOULDERS[1]]) / 2.0
                if seen[_SHOULDERS[0]] and seen[_SHOULDERS[1]] else None
            ),
            "knees_seen": bool(seen[_KNEES[0]] or seen[_KNEES[1]]),
        }
        self._samples.append(sample)
        while self._samples and t_sec - self._samples[0]["t"] > self.window_sec:
            self._samples.popleft()

        self._update_nod(sample)

    def note_glitch(self) -> None:
        """서비스가 글리치 프레임을 버렸음을 기록한다 (측정 투명성 카운터)."""
        self.glitch_frames += 1

    def reset(self) -> None:
        """창과 끄덕임 상태 기계를 비운다 (추적이 끊겼을 때).

        누적 카운터(`_reversals`·`glitch_frames`)는 **일부러 남긴다** — 브라우저가
        턴 시작·끝의 차이로 턴별 값을 얻으므로 단조 증가여야 한다. 여기서 0으로
        되돌리면 그 차이가 음수가 되어 턴 집계가 조용히 망가진다.
        """
        self._samples.clear()
        self._nod_prev_gap = None
        self._nod_dir = 0
        self._nod_swing = 0.0
        self._nod_last_reversal_sec = None

    # -- 끄덕임 -------------------------------------------------------------

    def _update_nod(self, sample: dict) -> None:
        """고개-어깨중심 수직 간격의 방향 반전을 센다 (반전 2회 = 끄덕임 1회).

        간격을 쓰는 이유는 브라우저 구현과 같다 — 몸 전체가 출렁이면 머리와
        어깨가 함께 움직여 간격이 그대로라 상쇄되고, **고개만** 움직일 때 잡힌다.
        브라우저는 이것을 2D 픽셀 거리로 쟀고 여기서는 중력정렬 세계 좌표의
        수직 성분으로 잰다 — 같은 양의 더 정확한 측정이다.
        """
        head, mid, span = sample["head"], sample["shoulder_mid"], sample["span"]
        if head is None or mid is None or not span:
            return
        gap = float(head[1] - mid[1]) / span
        prev = self._nod_prev_gap
        self._nod_prev_gap = gap
        if prev is None:
            return

        delta = gap - prev
        if abs(delta) <= NOD_JITTER_EPS:
            return
        direction = 1 if delta > 0 else -1
        if direction != self._nod_dir:
            last = self._nod_last_reversal_sec
            fresh = last is None or sample["t"] - last <= NOD_MAX_SWING_SEC
            if self._nod_dir != 0 and self._nod_swing >= NOD_MIN_SWING and fresh:
                self._reversals += 1
            self._nod_last_reversal_sec = sample["t"]
            self._nod_dir = direction
            self._nod_swing = 0.0
        self._nod_swing += abs(delta)

    # -- 출력 ---------------------------------------------------------------

    def snapshot(self) -> dict:
        """롤링 창의 동작 지표. 표본이 모자란 축은 숫자를 만들지 않고 None."""
        out = {
            "samples": len(self._samples),
            "nod_total": self.nod_count,
            "glitch_total": self.glitch_frames,
            "hands_visible_ratio": None,
            "gesture_speed_ms": None,
            "gesture_active_ratio": None,
            "gesture_amplitude_cm": None,
            "gesture_two_handed_ratio": None,
            "hand_face_ratio": None,
            "hip_sway_norm": None,
            "lower_visible_ratio": None,
        }
        samples = list(self._samples)
        if len(samples) < MIN_MOTION_SAMPLES:
            return out

        out["hands_visible_ratio"] = _round(
            sum(1 for s in samples if any(w is not None for w in s["wrists"])) / len(samples), 2)
        out["lower_visible_ratio"] = _round(
            sum(1 for s in samples if s["knees_seen"]) / len(samples), 2)

        self._fill_gesture(samples, out)
        self._fill_proximity(samples, out)
        self._fill_hip_sway(samples, out)
        return out

    def _fill_gesture(self, samples: list[dict], out: dict) -> None:
        """손목 속도·활동률·크기·양손 비율.

        좌우를 따로 계산한 뒤 합치는 이유: 한 손만 보이는 프레임이 흔한데
        (몸에 가려짐), 양손을 한 배열로 묶으면 그 프레임에서 짝이 어긋난다.
        """
        speeds: list[float] = []  # 프레임별 (좌속도, 우속도) — 양손 판정에 쓴다
        per_frame: dict[float, list[float]] = {}
        reaches: list[float] = []

        for side in (0, 1):
            times, points = [], []
            for s in samples:
                wrist = s["wrists"][side]
                if wrist is not None:
                    times.append(s["t"])
                    points.append(wrist)
            if len(points) < MIN_SPEED_PAIRS + 1:
                continue
            ts = np.asarray(times, dtype=float)
            pts = _median3(np.asarray(points, dtype=float))
            dt = np.diff(ts)
            step = np.linalg.norm(np.diff(pts, axis=0), axis=1)
            valid = dt > 1e-6
            if not np.any(valid):
                continue
            # mm/s → m/s
            side_speeds = (step[valid] / dt[valid]) / 1000.0
            speeds.extend(side_speeds.tolist())
            for t, v in zip(ts[1:][valid], side_speeds):
                per_frame.setdefault(round(float(t), 4), []).append(float(v))

        for s in samples:
            mid = s["shoulder_mid"]
            if mid is None:
                continue
            for wrist in s["wrists"]:
                if wrist is not None:
                    reaches.append(float(np.linalg.norm(wrist - mid)) / 10.0)  # mm → cm

        if speeds:
            out["gesture_speed_ms"] = _round(float(np.mean(speeds)), 3)
            out["gesture_active_ratio"] = _round(
                float(np.mean(np.asarray(speeds) > GESTURE_ACTIVE_MS)), 2)
        if reaches:
            out["gesture_amplitude_cm"] = _round(float(np.mean(reaches)), 1)
        # 양손 비율의 분모는 '한 손이라도 움직인 프레임' — 브라우저와 같은 정의
        active_frames = [v for v in per_frame.values() if any(x > GESTURE_ACTIVE_MS for x in v)]
        if active_frames:
            two = sum(1 for v in active_frames
                      if len(v) == 2 and all(x > GESTURE_ACTIVE_MS for x in v))
            out["gesture_two_handed_ratio"] = _round(two / len(active_frames), 2)

    def _fill_proximity(self, samples: list[dict], out: dict) -> None:
        """손이 얼굴 근처에 있던 프레임 비율 — 무의식 습관(입 가리기·턱 괴기)."""
        usable = [s for s in samples if s["head"] is not None
                  and any(w is not None for w in s["wrists"])]
        if not usable:
            return
        near = 0
        for s in usable:
            for wrist in s["wrists"]:
                if wrist is not None and float(np.linalg.norm(wrist - s["head"])) <= HAND_FACE_MM:
                    near += 1
                    break
        out["hand_face_ratio"] = _round(near / len(usable), 2)

    def _fill_hip_sway(self, samples: list[dict], out: dict) -> None:
        """골반 좌우 흔들림(어깨너비 정규화) — 체중을 번갈아 싣는 습관.

        어깨(상체) 흔들림과 다른 축이다: 상체는 고정한 채 골반만 좌우로 옮기는
        사람이 실제로 많고, 그건 시각적으로 '들썩임'으로 읽힌다.
        """
        xs = [float(s["pelvis"][0]) for s in samples if s["pelvis"] is not None]
        spans = [s["span"] for s in samples if s["span"]]
        if len(xs) < MIN_MOTION_SAMPLES or not spans:
            return
        span = float(np.median(spans))
        if span <= 1.0:
            return
        out["hip_sway_norm"] = _round(float(np.std(xs)) / span, 4)


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(float(value), digits)

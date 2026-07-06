"""결정적 순간 감지 — 턴 평균이 아니라 '순간'을 잡는다 (마스터리 ⑥ 핵심).

세 시간축을 하나로 정렬한다:
  · 비언어 타임라인 (2초 빈: 정면율·긴장율·기울기 — 프론트 집계 전송)
  · 음성 스팬 (Vosk 정렬: 구간별 성량·속도 + 그때 한 말)
  · 턴 이벤트 (질문 유형 — 압박 맥락)

단일 모달 이벤트가 4초 창 안에서 겹치면 '복합 순간'으로 승격하고, 그 시각의
음성 스팬에서 **그때 하던 말을 인용**한다 — "3번째 답변 12초: 시선 이탈과 긴장
표정이 겹쳤어요. 그때 하던 말: '재발 방지는…'"

전부 보수적 임계값 + 상위 3개만 노출 (과잉 지적 금지 원칙).
"""

# 단일 모달 이벤트 임계값 (2초 빈 기준, 2빈 연속 = 4초 지속일 때만)
GAZE_BREAK_FRONT = 0.4    # 정면율이 이 밑으로
TENSION_PRESS = 0.4       # 입술 압축율이 이 위로
POSTURE_TILT_DEG = 8.0    # 어깨 기울기
MIN_CONSECUTIVE_BINS = 2  # 순간 지속 최소 빈 수
COMPOSITE_WINDOW_SEC = 4.0
MAX_MOMENTS = 3

KIND_LABEL = {
    "gaze": "시선 이탈",
    "tension": "긴장 표정",
    "posture": "자세 흔들림",
    "quiet": "성량 저하",
    "fast": "말 급해짐",
}


def _runs(timeline: list[dict], key: str, predicate) -> list[dict]:
    """타임라인에서 조건이 연속 충족되는 구간들 → [{start, end}]."""
    runs: list[dict] = []
    current: dict | None = None
    for bin_ in timeline:
        value = bin_.get(key)
        if value is not None and predicate(value):
            if current is None:
                current = {"start": bin_["t"], "bins": 1}
            else:
                current["bins"] += 1
        else:
            if current and current["bins"] >= MIN_CONSECUTIVE_BINS:
                runs.append(current)
            current = None
    if current and current["bins"] >= MIN_CONSECUTIVE_BINS:
        runs.append(current)
    return runs


def _span_at(alignment: dict | None, at_sec: float) -> dict | None:
    """해당 시각에 가장 가까운 음성 스팬(1초 관용) — '그때 하던 말' 인용용.

    스팬 사이 침묵 지점에서는 거리가 최소인 스팬을 고른다 (첫 매칭이 아니라).
    """
    best, best_dist = None, 1.0 + 1e-9
    for span in (alignment or {}).get("spans", []):
        if span["start"] <= at_sec <= span["end"]:
            dist = 0.0
        else:
            dist = min(abs(at_sec - span["start"]), abs(at_sec - span["end"]))
        if dist < best_dist:
            best, best_dist = span, dist
    return best


def detect_turn_events(timeline: list[dict], alignment: dict | None) -> list[dict]:
    """단일 모달 이벤트 수집 → [{kind, at, duration_bins?}] (턴 내 상대 초)."""
    events: list[dict] = []
    for run in _runs(timeline, "front", lambda v: v < GAZE_BREAK_FRONT):
        events.append({"kind": "gaze", "at": run["start"]})
    for run in _runs(timeline, "press", lambda v: v >= TENSION_PRESS):
        events.append({"kind": "tension", "at": run["start"]})
    for run in _runs(timeline, "tilt", lambda v: v >= POSTURE_TILT_DEG):
        events.append({"kind": "posture", "at": run["start"]})

    align = alignment or {}
    spans = align.get("spans", [])
    if "quietest" in align and spans:
        events.append({"kind": "quiet", "at": spans[align["quietest"]]["start"]})
    if "fastest" in align and spans:
        events.append({"kind": "fast", "at": spans[align["fastest"]]["start"]})
    return sorted(events, key=lambda e: e["at"])


def _compose(events: list[dict]) -> list[dict]:
    """4초 창 안에서 겹치는 서로 다른 모달을 복합 순간으로 병합."""
    moments: list[dict] = []
    used = [False] * len(events)
    for i, ev in enumerate(events):
        if used[i]:
            continue
        group = [ev]
        used[i] = True
        for j in range(i + 1, len(events)):
            if used[j]:
                continue
            if events[j]["at"] - ev["at"] <= COMPOSITE_WINDOW_SEC \
                    and events[j]["kind"] != ev["kind"]:
                group.append(events[j])
                used[j] = True
        moments.append({
            "at": ev["at"],
            "kinds": sorted({g["kind"] for g in group}),
            "composite": len({g["kind"] for g in group}) >= 2,
        })
    return moments


def build_turn_moments(
    turn_order: int, question_type: str,
    timeline: list[dict], alignment: dict | None,
) -> list[dict]:
    """한 턴의 결정적 순간들 — 설명문·발화 인용 포함."""
    events = detect_turn_events(timeline, alignment)
    if not events:
        return []
    moments = []
    for m in _compose(events):
        labels = " + ".join(KIND_LABEL[k] for k in m["kinds"])
        at = int(m["at"])
        context = ""
        if question_type == "pressure" and at <= 6:
            context = "압박 질문을 받은 직후예요. "
        desc = f"답변 {at}초 지점: {labels}"
        if m["composite"]:
            desc += "이 동시에 나타났어요"
        else:
            desc += "이 있었어요"
        span = _span_at(alignment, m["at"])
        quote = span["text"][:50] if span else None
        moments.append({
            "turn_order": turn_order,
            "at_sec": at,
            "kinds": m["kinds"],
            "composite": m["composite"],
            "description": context + desc,
            "quote": quote,  # 그때 하던 말 (음성 스팬 정렬이 있을 때만)
            "pressure_context": question_type == "pressure",
        })
    return moments


def build_moments(turns_data: list[dict]) -> list[dict]:
    """세션 전체의 결정적 순간 상위 MAX_MOMENTS개.

    turns_data: [{turn_order, question_type, timeline, alignment}]
    우선순위: 복합(다중 모달) > 압박 맥락 > 이른 순간.
    """
    all_moments: list[dict] = []
    for td in turns_data:
        all_moments += build_turn_moments(
            td["turn_order"], td.get("question_type", "initial"),
            td.get("timeline") or [], td.get("alignment"),
        )
    all_moments.sort(
        key=lambda m: (not m["composite"], not m["pressure_context"], m["turn_order"], m["at_sec"]),
    )
    return all_moments[:MAX_MOMENTS]

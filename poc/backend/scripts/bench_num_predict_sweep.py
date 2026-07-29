"""num_predict 스윕 — 병렬 턴에서 p95·폴백률·문장 완결을 값별로 비교해 최적값을 찾는다.

실제 프로바이더 함수를 그대로 태운다(프롬프트 구성·형식 검증 보존).
각 모듈의 httpx만 얇게 감싸 options.num_predict만 덮어써서 값을 주입한다.
sessions.py와 동일하게 리액션+질문을 ThreadPoolExecutor로 동시 호출한다.

게이트: 병렬 턴 대기 p95 < ollama_timeout_sec(7.0s), 그리고 폴백률이 낮을 것.
"""
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

import httpx as _real_httpx

from app.core.config import settings
from app.services.dialogue import ollama_provider, reactions
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.ollama_provider import OllamaDialogueProvider

ANSWERS = [
    "네, 확인해서 다시 연락드리겠습니다.",
    "일단 롤백해서 서비스는 복구된 상태입니다.",
    "오늘 목표는 온보딩 문서를 다 파악하는 겁니다.",
    "고객사에는 15분 안에 1차 회신을 드리겠습니다.",
    "원인은 아직 정확히 모르겠고, 로그부터 보고 있습니다.",
    "결론부터 말씀드리면 배포가 원인이었고 지금은 정상입니다.",
    "제가 맡은 부분은 끝냈는데 QA 쪽이 좀 밀렸습니다.",
    "죄송합니다, 그 일정은 제가 놓쳤습니다. 바로 조치하겠습니다.",
    "우선순위를 다시 잡아서 A건부터 처리하겠습니다.",
]
CHARACTERS = [
    {"name": "한지민 매니저", "speech_style": "빠르고 긴박한 어조"},
    {"name": "박서연 선임", "speech_style": "친절하지만 정확한 표현을 요구"},
    {"name": "김태호 팀장", "speech_style": "짧고 단호한 문장, 존댓말이지만 딱딱함"},
]
SITUATIONS = [
    "출근 직후 상사가 어제 장애 대응 상황을 묻는다.",
    "점심 전 선배가 진행 중인 작업의 우선순위를 확인한다.",
    "오후 회의에서 팀장이 일정 지연 사유를 캐묻는다.",
]
INTENTS = ["회신 시점 약속", "원인 한 문장", "협업 경로 인식", "우선순위 근거", "재발 방지책"]
BASE_Q = "그 부분을 조금 더 구체적으로 말씀해 주시겠어요?"
BASE_R = "알겠습니다, 그렇게 진행하죠."
N = 18

# 스윕 구성: (질문 num_predict, 리액션 num_predict). 현재값은 (80, 60).
CONFIGS = [
    (48, 60),
    (56, 60),
    (64, 60),
    (72, 60),
    (80, 60),  # 현재값
    (48, 48),  # 둘 다 축소
]


class Shim:
    """httpx 투명 프록시 — post만 가로채 options.num_predict를 덮어쓰고,
    나머지 속성(HTTPError 등 예외 클래스 포함)은 실제 httpx로 위임한다."""
    def __init__(self, num_predict):
        self.np = num_predict

    def post(self, url, json=None, **kw):
        body = dict(json)
        body["options"] = {**body.get("options", {}), "num_predict": self.np}
        return _real_httpx.post(url, json=body, **kw)

    def __getattr__(self, name):
        return getattr(_real_httpx, name)


def pct(xs, p):
    xs = sorted(xs)
    k = (len(xs) - 1) * (p / 100)
    lo = int(k)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def run_config(provider, q_np, r_np):
    ollama_provider.httpx = Shim(q_np)
    reactions.httpx = Shim(r_np)

    lat, q_fb, r_fb, q_lens = [], 0, 0, []
    for i in range(N):
        ans = ANSWERS[i % len(ANSWERS)]
        char = CHARACTERS[i % len(CHARACTERS)]
        sit = SITUATIONS[i % len(SITUATIONS)]
        spec = QuestionSpec(1, "followup", BASE_Q, char["name"], INTENTS[i % len(INTENTS)])
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=2) as pool:
            qf = pool.submit(provider.personalize_question, spec, sit, ans)
            rf = pool.submit(reactions.personalize_reaction, BASE_R, char, ans)
            q_out, r_out = qf.result(), rf.result()
        lat.append(time.perf_counter() - t0)
        if q_out is None:
            q_fb += 1
        else:
            q_lens.append(len(q_out))
        if r_out == BASE_R:
            r_fb += 1
    return {
        "p50": pct(lat, 50), "p90": pct(lat, 90), "p95": pct(lat, 95), "max": max(lat),
        "q_fb": q_fb, "r_fb": r_fb,
        "q_valid_rate": (N - q_fb) / N,
        "q_len_med": statistics.median(q_lens) if q_lens else 0,
    }


def main():
    provider = OllamaDialogueProvider()
    gate = settings.ollama_timeout_sec

    # 워밍업
    print("워밍업(모델 적재)…")
    provider.personalize_question(
        QuestionSpec(1, "followup", BASE_Q, "c", "회신 시점 약속"), SITUATIONS[0], ANSWERS[0])

    rows = []
    for q_np, r_np in CONFIGS:
        r = run_config(provider, q_np, r_np)
        rows.append((q_np, r_np, r))
        passed = r["p95"] < gate
        print(
            f"\n[질문 np={q_np:2d}, 리액션 np={r_np:2d}]  "
            f"p50={r['p50']:.2f} p90={r['p90']:.2f} p95={r['p95']:.2f} max={r['max']:.2f}s"
            f"  게이트: {'PASS ✅' if passed else 'FAIL ❌'}"
        )
        print(
            f"   질문폴백 {r['q_fb']}/{N} (완결률 {r['q_valid_rate']*100:.0f}%, 중앙길이 {r['q_len_med']:.0f}자)"
            f"   리액션폴백 {r['r_fb']}/{N}"
        )

    # 요약 표 + 추천
    print("\n\n=== 스윕 요약 (게이트 p95 < %.1fs) ===" % gate)
    print(f"{'질문np':>6}{'리액션np':>8}{'p95':>8}{'질문폴백':>9}{'질문완결률':>10}{'중앙길이':>9}{'판정':>8}")
    best = None
    for q_np, r_np, r in rows:
        ok = r["p95"] < gate
        mark = "PASS" if ok else "FAIL"
        print(f"{q_np:>6}{r_np:>8}{r['p95']:>7.2f}s{r['q_fb']:>7}/{N}"
              f"{r['q_valid_rate']*100:>8.0f}%{r['q_len_med']:>7.0f}자{mark:>8}")
        # 최적: 게이트 PASS 중 완결률 최고, 동률이면 p95 낮은 쪽
        score = (ok, r["q_valid_rate"], -r["p95"])
        if ok and (best is None or score > best[0]):
            best = (score, q_np, r_np, r)

    print()
    if best:
        _, bq, br, r = best
        print(f"추천 ▶ 질문 num_predict={bq}, 리액션 num_predict={br}  "
              f"(p95={r['p95']:.2f}s, 질문완결률 {r['q_valid_rate']*100:.0f}%, 질문폴백 {r['q_fb']}/{N})")
    else:
        print("게이트를 통과하는 구성이 없음 — num_predict 외 조치(턴당 1건 개인화/타임아웃 상향) 필요")


if __name__ == "__main__":
    main()

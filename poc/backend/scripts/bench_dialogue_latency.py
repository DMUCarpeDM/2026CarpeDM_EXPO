"""실기기 대화 LLM 응답속도 실측 — few-shot 프롬프트 반영본 p95 게이트 확인.

두 실사용 호출점을 그대로 태운다:
  1) personalize_question  (후속/압박 질문 개인화, num_predict=80)
  2) personalize_reaction  (리액션 문장 개인화, num_predict=60)

턴 1회 = 리액션 + 후속질문 두 호출이 이어지므로 '턴 합산' 지연도 함께 본다.
게이트: ollama_timeout_sec(현재 7.0s) 미만이어야 폴백 없이 표시된다.
"""
import statistics
import time

from app.core.config import settings
from app.services.dialogue import reactions
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.ollama_provider import OllamaDialogueProvider

# 실제 전시에서 나올 법한 다양한 답변 (동일 프롬프트 캐시로 왜곡되지 않게 변주)
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
    "그건 제 권한 밖이라 팀장님 확인이 필요할 것 같습니다.",
]
SITUATIONS = [
    "출근 직후 상사가 어제 장애 대응 상황을 묻는다.",
    "점심 전 선배가 진행 중인 작업의 우선순위를 확인한다.",
    "오후 회의에서 팀장이 일정 지연 사유를 캐묻는다.",
]
CHARACTERS = [
    {"name": "한지민 매니저", "speech_style": "빠르고 긴박한 어조"},
    {"name": "박서연 선임", "speech_style": "친절하지만 정확한 표현을 요구"},
    {"name": "김태호 팀장", "speech_style": "짧고 단호한 문장, 존댓말이지만 딱딱함"},
]
INTENTS = ["회신 시점 약속", "원인 한 문장", "협업 경로 인식", "우선순위 근거", "재발 방지책"]
BASE_Q = "그 부분을 조금 더 구체적으로 말씀해 주시겠어요?"
BASE_R = "알겠습니다, 그렇게 진행하죠."

N = 24  # 각 호출점 반복 횟수


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return 0.0
    k = (len(xs) - 1) * (p / 100)
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def summarize(name, lats, fallbacks):
    print(f"\n[{name}] n={len(lats)}  폴백(타임아웃/형식실패)={fallbacks}/{len(lats)}")
    print(f"  p50={pct(lats,50):.2f}s  p90={pct(lats,90):.2f}s  "
          f"p95={pct(lats,95):.2f}s  max={max(lats):.2f}s  mean={statistics.mean(lats):.2f}s")
    gate = settings.ollama_timeout_sec
    verdict = "PASS ✅" if pct(lats, 95) < gate else "FAIL ❌"
    print(f"  게이트(p95 < {gate}s): {verdict}")
    return pct(lats, 95)


def main():
    provider = OllamaDialogueProvider()

    # 워밍업 — 모델 메모리 적재 지연을 측정에서 분리
    print("워밍업(모델 적재)…")
    t0 = time.perf_counter()
    provider.personalize_question(
        QuestionSpec(1, "followup", BASE_Q, "c1", "회신 시점 약속"),
        SITUATIONS[0], ANSWERS[0],
    )
    print(f"  cold-start 1회: {time.perf_counter()-t0:.2f}s\n")

    q_lat, q_fb = [], 0
    r_lat, r_fb = [], 0
    turn_lat = []

    for i in range(N):
        ans = ANSWERS[i % len(ANSWERS)]
        char = CHARACTERS[i % len(CHARACTERS)]
        sit = SITUATIONS[i % len(SITUATIONS)]
        intent = INTENTS[i % len(INTENTS)]

        # 리액션 개인화
        t0 = time.perf_counter()
        r_out = reactions.personalize_reaction(BASE_R, char, ans)
        r_dt = time.perf_counter() - t0
        r_lat.append(r_dt)
        if r_out == BASE_R:  # 폴백
            r_fb += 1

        # 후속질문 개인화
        spec = QuestionSpec(1, "followup", BASE_Q, char["name"], intent)
        t0 = time.perf_counter()
        q_out = provider.personalize_question(spec, sit, ans)
        q_dt = time.perf_counter() - t0
        q_lat.append(q_dt)
        if q_out is None:  # 폴백
            q_fb += 1

        turn_lat.append(r_dt + q_dt)
        print(f"  turn {i+1:2d}/{N}: 리액션 {r_dt:.2f}s + 질문 {q_dt:.2f}s = {r_dt+q_dt:.2f}s"
              f"{'  ⚠폴백' if (r_out==BASE_R or q_out is None) else ''}")

    summarize("리액션 personalize_reaction (num_predict=60)", r_lat, r_fb)
    summarize("후속질문 personalize_question (num_predict=80)", q_lat, q_fb)
    summarize("턴 합산 (리액션+질문 순차, 참고)", turn_lat, 0)

    # sessions.py와 동일한 병렬 실행 — 실제 체험자가 기다리는 벽시계 시간.
    # 같은 Ollama 인스턴스에 2요청 동시 → 경합으로 각 호출이 순차보다 느려질 수 있다.
    from concurrent.futures import ThreadPoolExecutor
    print("\n\n=== 실제 병렬 실행(sessions.py 재현) — 체험자 실대기 ===")
    par_lat, par_fb = [], 0
    for i in range(N):
        ans = ANSWERS[i % len(ANSWERS)]
        char = CHARACTERS[i % len(CHARACTERS)]
        sit = SITUATIONS[i % len(SITUATIONS)]
        intent = INTENTS[i % len(INTENTS)]
        spec = QuestionSpec(1, "followup", BASE_Q, char["name"], intent)
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=2) as pool:
            qf = pool.submit(provider.personalize_question, spec, sit, ans)
            rf = pool.submit(reactions.personalize_reaction, BASE_R, char, ans)
            q_out, r_out = qf.result(), rf.result()
        dt = time.perf_counter() - t0
        par_lat.append(dt)
        fb = (q_out is None) or (r_out == BASE_R)
        if fb:
            par_fb += 1
        print(f"  turn {i+1:2d}/{N}: 병렬 대기 {dt:.2f}s{'  ⚠폴백' if fb else ''}")
    summarize("병렬 턴 대기 (실제 UX, max(질문,리액션))", par_lat, par_fb)


if __name__ == "__main__":
    main()

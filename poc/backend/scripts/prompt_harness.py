"""캐릭터 프롬프트 검증 하네스 — 조합별 개인화 성공률(=비폴백률)을 측정한다.

시스템 프롬프트 튜닝을 감이 아니라 수치로 하기 위한 도구. 캐릭터 × 질문 유형 ×
난이도 조합마다 실제 운영 경로(OllamaDialogueProvider.personalize_question —
프롬프트 조립 → 생성 → 형식 검증)를 N회 돌려서:

  - 성공률: 형식 검증을 통과해 개인화가 채택된 비율 (실패 = 템플릿 폴백)
  - 지연: 생성 왕복 시간 (전시 체감 대기의 재료)
  - 샘플: 채택된 문장 — 말투 유지 여부는 사람이 훑어본다

재료는 시드(CHARACTERS/WORLD_SETTING/EPISODES)에서 그대로 가져온다 — DB 불필요.
에피소드에 아직 캐스팅되지 않은 예비 캐릭터(임원/외부 고객)는 공용 샘플 상황을 쓴다.

실행:  (backend/ 에서)
  python -m scripts.prompt_harness --dump            # 오프라인: 조립된 프롬프트만 출력
  python -m scripts.prompt_harness                   # 라이브: Ollama 필요, 조합별 3회
  python -m scripts.prompt_harness --runs 5 --difficulties basic,pressure
  python -m scripts.prompt_harness --chars kang_executive,choi_client

목표선: 폴백률 20% 이하 (실패 사례는 speech_examples/규칙에 반영해서 회귀).
"""
import argparse
import statistics
import sys
import time

import httpx

from app.core.config import settings
from app.seed.seed_data import CHARACTERS, EPISODES, WORLD_SETTING
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.ollama_provider import OllamaDialogueProvider
from app.services.dialogue.prompts import QUESTION_TYPE_RULES, build_character_system_prompt

# 좋은 답/약한 답을 번갈아 넣는다 — 실제 체험자 답변의 양극단을 흉내낸 고정 재료.
SAMPLE_ANSWERS = [
    "결론부터 말씀드리면 로그인 오류 원인은 오전 배포의 인증 설정으로 보이고, 15분 안에 1차 확인 결과를 공유드리겠습니다.",
    "어… 그게 아마 서버 문제인 것 같은데, 정확한 건 잘 모르겠습니다.",
]

# 에피소드에 아직 캐스팅되지 않은 캐릭터용 공용 샘플 장면
DEFAULT_SAMPLE = {
    "situation": "고객사 로그인 장애 대응이 진행 중인 오후. 경과를 보고하는 자리다.",
    "followup": {"text": "지금 상황을 한 문장으로 정리하면요?", "intent": "누락 요소 확인: 핵심 상황 요약"},
    "pressure": {"text": "이게 처음이 아니라는 게 문제예요. 뭐가 다를 거죠?", "intent": "압박 상황 대응 확인"},
    "deepening": {"text": "좋아요. 그럼 재발 방지는 어떻게 하실 거예요?", "intent": "장면 심화 전개"},
}


def sample_for(character_id: str, question_type: str) -> dict:
    """캐릭터가 등장하는 시드 에피소드에서 유형별 기준 질문·intent·상황을 뽑는다."""
    ep = next((e for e in EPISODES if e["character_id"] == character_id), None)
    if ep is None:
        base = DEFAULT_SAMPLE[question_type]
        return {"situation": DEFAULT_SAMPLE["situation"], **base}
    if question_type == "followup" and ep.get("checklist"):
        item = ep["checklist"][0]
        return {"situation": ep["situation"], "text": item["followup"],
                "intent": f"누락 요소 확인: {item['label']}"}
    if question_type == "pressure" and ep.get("pressure_questions"):
        return {"situation": ep["situation"], "text": ep["pressure_questions"][0]["text"],
                "intent": "압박 상황 대응 확인"}
    if question_type == "deepening" and ep.get("deepening_questions"):
        dq = ep["deepening_questions"][0]
        return {"situation": ep["situation"], "text": dq["text"],
                "intent": dq.get("intent", "장면 심화 전개")}
    base = DEFAULT_SAMPLE[question_type]
    return {"situation": ep["situation"], **base}


def make_spec(character_id: str, question_type: str, sample: dict) -> QuestionSpec:
    return QuestionSpec(
        episode_id=0, question_type=question_type, question_text=sample["text"],
        character_id=character_id, intent=sample["intent"],
    )


def check_ollama() -> bool:
    try:
        httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=3).raise_for_status()
        return True
    except Exception:
        return False


def dump(characters: list[dict], types: list[str], difficulties: list[str]) -> None:
    """오프라인 모드 — 조립된 시스템 프롬프트를 눈으로 검수한다."""
    for ch in characters:
        for qt in types:
            for diff in difficulties:
                print("=" * 72)
                print(f"◆ {ch['name']} ({ch['id']}) × {qt} × {diff}")
                print("=" * 72)
                print(build_character_system_prompt(ch, WORLD_SETTING, qt, diff))
                print()


def run_live(
    characters: list[dict], types: list[str], difficulties: list[str],
    runs: int, generic: bool = False,
) -> int:
    if not check_ollama():
        print(f"!! Ollama에 연결할 수 없습니다 ({settings.ollama_base_url}) — "
              f"`ollama serve` 후 재시도하거나 --dump로 프롬프트만 검수하세요.")
        return 1
    label = "범용(기준선)" if generic else "캐릭터별"
    print(f"model={settings.ollama_model}  runs/조합={runs}  프롬프트={label}  "
          f"(성공=형식 검증 통과 → 개인화 채택, 실패=템플릿 폴백)\n")

    provider = OllamaDialogueProvider()
    rows, total_ok, total_n = [], 0, 0
    for ch in characters:
        for qt in types:
            sample = sample_for(ch["id"], qt)
            for diff in difficulties:
                ok, latencies, outputs = 0, [], []
                for i in range(runs):
                    spec = make_spec(ch["id"], qt, sample)
                    answer = SAMPLE_ANSWERS[i % len(SAMPLE_ANSWERS)]
                    t0 = time.perf_counter()
                    text = provider.personalize_question(
                        spec, sample["situation"], answer,
                        character=None if generic else ch,
                        world=WORLD_SETTING, difficulty=diff,
                    )
                    latencies.append(time.perf_counter() - t0)
                    if text:
                        ok += 1
                        outputs.append(text)
                total_ok, total_n = total_ok + ok, total_n + runs
                rows.append((ch, qt, diff, ok, runs, latencies, outputs))
                mean_ms = statistics.mean(latencies) * 1000
                print(f"  {ch['name']:8s} × {qt:9s} × {diff:8s}  "
                      f"{ok}/{runs} 성공  평균 {mean_ms:5.0f}ms")
                for out in outputs[:2]:
                    print(f"      └ {out}")

    fallback_rate = 100 * (1 - total_ok / total_n) if total_n else 0.0
    print("\n" + "-" * 72)
    print(f"합계: {total_ok}/{total_n} 성공 — 폴백률 {fallback_rate:.0f}% (목표 20% 이하)")
    worst = sorted(rows, key=lambda r: r[3] / r[4])[:3]
    if any(r[3] < r[4] for r in worst):
        print("우선 튜닝 대상(성공률 낮은 순):")
        for ch, qt, diff, ok, n, _, _ in worst:
            if ok < n:
                print(f"  - {ch['id']} × {qt} × {diff}: {ok}/{n}")
    return 0 if fallback_rate <= 20 else 2


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dump", action="store_true", help="프롬프트 조립 결과만 출력 (Ollama 불필요)")
    ap.add_argument("--runs", type=int, default=3, help="조합별 생성 횟수 (기본 3)")
    ap.add_argument("--chars", default="", help="캐릭터 id 콤마 목록 (기본 전원)")
    ap.add_argument("--types", default=",".join(QUESTION_TYPE_RULES),
                    help="질문 유형 콤마 목록 (기본 followup,pressure,deepening)")
    ap.add_argument("--difficulties", default="basic", help="난이도 콤마 목록 (기본 basic)")
    ap.add_argument("--generic", action="store_true",
                    help="범용 프롬프트로 측정 (캐릭터별 프롬프트와의 A/B 기준선)")
    args = ap.parse_args()

    wanted = {c for c in args.chars.split(",") if c}
    characters = [c for c in CHARACTERS if not wanted or c["id"] in wanted]
    if not characters:
        print(f"!! 캐릭터를 찾을 수 없습니다: {args.chars} "
              f"(가능: {', '.join(c['id'] for c in CHARACTERS)})")
        return 1
    types = [t for t in args.types.split(",") if t in QUESTION_TYPE_RULES]
    difficulties = [d for d in args.difficulties.split(",") if d]

    if args.dump:
        dump(characters, types, difficulties)
        return 0
    return run_live(characters, types, difficulties, args.runs, generic=args.generic)


if __name__ == "__main__":
    sys.exit(main())

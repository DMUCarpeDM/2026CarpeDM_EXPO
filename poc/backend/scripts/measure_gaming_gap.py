"""게이밍 갭 측정 (S-B2B-JUDGE 검증 5단계) — '말한 척'에 대한 시스템 취약도 정량화.

키워드 낭독·공손한 공백·필러 범벅 답변에 대해 (a) 시스템 점수와 (b) 사람 채점을
같은 시트에서 비교한다. 사람은 낮게 주는데 시스템이 높게 주는 격차(갭)가
평가 견고성 지표가 되고, 갭이 크게 측정된 카테고리는 judge 루브릭·감점 규칙
개선의 근거가 된다 (개선 후 재측정으로 개선 폭을 증명한다).

사용법:
  1) 시스템 점수 산출 + 사람 채점 시트 생성:
     ./.venv/Scripts/python.exe scripts/measure_gaming_gap.py score gaming_ratings.csv
     ./.venv/Scripts/python.exe scripts/measure_gaming_gap.py score gaming_ratings.csv --with-judge
  2) 사람 채점(0~100, rater 열에 이름) 후 갭 계산:
     ./.venv/Scripts/python.exe scripts/measure_gaming_gap.py gap gaming_ratings.csv

측정 구성 주의 (논문 인용 시 반드시 명기):
- 기본 system_score는 **결정적 레이어 한정**(키워드 판정, use_semantic=False,
  judge 미포함) — 어느 PC에서든 재현되는 하한 기준선이다. 배포 시스템의 세션
  점수는 여기에 judge 30% 혼합·의미 매칭이 얹히므로 다르다.
- judge 루브릭 개선 폭을 재려면 `--with-judge`(Ollama 필요)를 켜라 —
  케이스별 judge 중앙값과 배포 혼합점수(blended)가 열로 추가된다.
  기본 모드 수치는 judge를 아무리 고쳐도 변하지 않는다.

케이스 정의: tests/golden/adversarial_cases.json (DB 불필요 — 팩·시드에서 직접 채점).
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

CASES_PATH = Path(__file__).resolve().parent.parent / "tests" / "golden" / "adversarial_cases.json"


def _checklist_for(scenario: str, episode_order: int) -> list[dict]:
    """팩(JSON) 또는 기존 시드에서 에피소드 체크리스트를 찾는다 — DB 불필요."""
    from app.seed.packs import load_pack_files

    for pack in load_pack_files():
        if pack["slug"] == scenario:
            for ep in pack["episodes"]:
                if ep["order"] == episode_order:
                    return ep.get("checklist", [])
    from app.seed.seed_data import EPISODES, SCENARIO

    if scenario == SCENARIO["slug"]:
        for ep in EPISODES:
            if ep["order"] == episode_order:
                return ep.get("checklist", [])
    raise SystemExit(f"시나리오/에피소드를 찾을 수 없음: {scenario} #{episode_order}")


def _score_cases() -> list[dict]:
    from app.ai import response_fit

    doc = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    rows = []
    for case in doc["cases"]:
        checklist = _checklist_for(case["scenario"], case["episode_order"])
        # 키워드 판정 고정 — 의미 매칭·Ollama 유무와 무관하게 재현 가능 (결정적 하한 기준선)
        metrics = response_fit.analyze_response(case["response"], checklist, use_semantic=False)
        score = response_fit.score_response(metrics)
        rows.append({
            "case_id": case["id"],
            "category": case["category"],
            "expected_human": case["expected_human"],
            "system_score": round(score, 1),
            "coverage": metrics["coverage"],
            "banned_hits": len(metrics["banned_hits"]),
            "response": case["response"],
        })
    return rows


def _judge_case(case: dict) -> dict:
    """케이스 하나를 judge로 채점 — 배포 경로(analysis.py)와 같은 함수·혼합식 사용."""
    from app.ai import judge
    from app.seed.packs import load_pack_files

    class _Turn:  # judge.build_transcript가 요구하는 최소 형태
        episode = None

        def __init__(self, question, response):
            self.question_text = question
            self.response_text = response

    question = ""
    for pack in load_pack_files():
        if pack["slug"] == case["scenario"]:
            for ep in pack["episodes"]:
                if ep["order"] == case["episode_order"]:
                    question = ep["initial_question"]
    result = judge.judge_response_session([_Turn(question, case["response"])])
    return result or {}


def cmd_score(out_path: str, with_judge: bool = False) -> None:
    from app.core.config import settings

    rows = _score_cases()
    if with_judge:
        from app.services.dialogue.availability import ollama_dialogue_ready

        if not ollama_dialogue_ready():
            raise SystemExit("--with-judge에는 Ollama 대화 모델이 필요합니다 (미가동).")
        from app.ai import judge as judge_module

        print("judge 채점 중 (케이스당 n회 호출 — 수 분 걸릴 수 있음)...")
        for r, case in zip(rows, json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]):
            info = _judge_case(case)
            r["judge_median"] = info.get("median")
            r["blended"] = (
                judge_module.blend(r["system_score"], info["median"])
                if info.get("median") is not None else None
            )

    config = (
        f"semantic=off judge={'on' if with_judge else 'off'} "
        f"blend_weight={settings.judge_blend_weight if with_judge else 'n/a'}"
    )
    header = f"{'case':26} {'category':18} {'det':>5} {'cov':>5} {'ban':>3}"
    if with_judge:
        header += f" {'judge':>6} {'blend':>6}"
    print(f"[측정 구성] {config}")
    print(header + "  기대(사람)")
    for r in rows:
        line = (f"{r['case_id']:26} {r['category']:18} {r['system_score']:5.1f} "
                f"{r['coverage']:5.2f} {r['banned_hits']:3d}")
        if with_judge:
            jm, bl = r.get("judge_median"), r.get("blended")
            line += f" {jm if jm is not None else '  실패':>6} {bl if bl is not None else '':>6}"
        print(line + f"  {r['expected_human']}")

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([f"# 측정 구성: {config} — system_score는 결정적 레이어 한정"])
        columns = ["case_id", "category", "system_score"]
        if with_judge:
            columns += ["judge_median", "blended"]
        writer.writerow(columns + ["rater", "human_score", "response"])
        for r in rows:
            row = [r["case_id"], r["category"], r["system_score"]]
            if with_judge:
                row += [r.get("judge_median", ""), r.get("blended", "")]
            writer.writerow(row + ["", "", r["response"]])
    print(f"\n사람 채점 시트 생성: {out_path}")
    print("→ rater(이름)·human_score(0~100)를 채운 뒤 `gap` 명령으로 격차를 계산하세요.")
    print("  채점자는 점수 열을 가리고(블라인드) response만 보고 채점할 것.")


def cmd_gap(csv_path: str) -> None:
    by_case: dict[str, dict] = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        lines = [line for line in f if not line.startswith("#")]  # 측정 구성 주석 행 제외
    used_blended = False
    for row in csv.DictReader(lines):
        # 배포 구성 갭 우선: --with-judge 시트면 blended(결정적+judge 혼합)를 쓴다
        blended = (row.get("blended") or "").strip()
        system = float(blended) if blended else float(row["system_score"])
        used_blended = used_blended or bool(blended)
        entry = by_case.setdefault(row["case_id"], {
            "category": row["category"],
            "system": system,
            "human": [],
        })
        if (row.get("human_score") or "").strip():
            entry["human"].append(float(row["human_score"]))
    print(f"[갭 기준] {'blended(배포 구성: 결정적+judge 혼합)' if used_blended else 'system_score(결정적 레이어 한정 — judge 미포함)'}")

    rated = {cid: e for cid, e in by_case.items() if e["human"]}
    if not rated:
        raise SystemExit("사람 채점(human_score)이 채워진 행이 없습니다.")

    print(f"{'case':26} {'category':18} {'sys':>6} {'human':>6} {'gap':>6}")
    by_category: dict[str, list[float]] = {}
    for cid, e in rated.items():
        human_mean = sum(e["human"]) / len(e["human"])
        gap = e["system"] - human_mean
        by_category.setdefault(e["category"], []).append(gap)
        print(f"{cid:26} {e['category']:18} {e['system']:6.1f} {human_mean:6.1f} {gap:+6.1f}")

    print("\n[카테고리별 평균 갭 = 시스템 - 사람] (+면 시스템이 후함 = 게이밍 취약)")
    for category, gaps in sorted(by_category.items()):
        mean_gap = sum(gaps) / len(gaps)
        flag = " ← 취약" if category != "control_good" and mean_gap >= 15 else ""
        print(f"  {category:18} {mean_gap:+6.1f} (n={len(gaps)}){flag}")
    print("\n해석: control_good의 갭이 ±10 안이면 채점 기준선이 정렬된 것.")
    print("적대 카테고리의 갭이 +15를 넘으면 judge 루브릭 감점 규칙을 보강한 뒤")
    print("`score --with-judge`로 재측정해 blended 갭의 개선 폭을 기록하세요")
    print("(기본 system_score는 결정적 레이어 한정이라 judge 개선이 반영되지 않습니다).")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--with-judge"]
    with_judge = "--with-judge" in sys.argv
    if len(args) != 2 or args[0] not in ("score", "gap"):
        print(__doc__)
        sys.exit(1)
    if args[0] == "score":
        cmd_score(args[1], with_judge=with_judge)
    else:
        cmd_gap(args[1])

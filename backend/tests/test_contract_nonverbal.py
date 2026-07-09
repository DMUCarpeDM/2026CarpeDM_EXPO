"""FE↔BE 비언어 지표 계약 검증 — 필드 드리프트가 조용히 삼켜지지 않게 한다.

Pydantic은 모르는 필드를 무시하므로, 프론트(useNonverbal→NonverbalMetrics)와
백엔드(NonverbalIn)의 필드명이 어긋나면 에러 없이 해당 지표만 0/None이 되고
리포트는 '측정 안 됨'으로 우아하게 넘어가 버그가 숨는다. 세 정의 중 두 끝단
(TS 타입 ↔ Pydantic 스키마)의 필드 집합을 직접 대조해 드리프트를 CI에서 잡는다.
"""
import re
from pathlib import Path

from app.schemas import NonverbalIn

TYPES_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "api" / "types.ts"


def _ts_interface_fields(name: str) -> set[str]:
    src = TYPES_TS.read_text(encoding="utf-8")
    match = re.search(rf"export interface {name} \{{(.*?)\n\}}", src, re.S)
    assert match, f"types.ts에서 {name} 인터페이스를 찾지 못함"
    fields = set()
    for line in match.group(1).splitlines():
        field = re.match(r"([a-zA-Z_][a-zA-Z0-9_]*)\??:", line.strip())
        if field:
            fields.add(field.group(1))
    return fields


def test_nonverbal_fields_match_between_frontend_and_backend():
    ts_fields = _ts_interface_fields("NonverbalMetrics")
    py_fields = set(NonverbalIn.model_fields)
    dropped = ts_fields - py_fields
    unknown = py_fields - ts_fields
    assert not dropped, (
        f"프론트가 보내지만 백엔드 스키마에 없어 조용히 버려지는 필드: {sorted(dropped)} "
        "— schemas.py NonverbalIn에 추가하세요"
    )
    assert not unknown, (
        f"백엔드만 아는(프론트가 보내지 않는) 필드: {sorted(unknown)} "
        "— types.ts NonverbalMetrics와 useNonverbal.ts endTurn에 추가하세요"
    )


def test_turn_signals_fields_match():
    ts_fields = _ts_interface_fields("TurnSignals")
    from app.schemas import TurnSignalsOut

    assert ts_fields == set(TurnSignalsOut.model_fields)

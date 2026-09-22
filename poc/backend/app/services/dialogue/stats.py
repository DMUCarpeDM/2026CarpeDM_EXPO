"""대화 생성/폴백 횟수 — 프로세스 로컬. 전시 아침 health 점검용."""
from threading import Lock

_lock = Lock()
_stats = {"generated": 0, "fallback": 0}


def note_generated() -> None:
    with _lock:
        _stats["generated"] += 1


def note_fallback() -> None:
    with _lock:
        _stats["fallback"] += 1


def snapshot() -> dict:
    with _lock:
        generated = _stats["generated"]
        fallback = _stats["fallback"]
    total = generated + fallback
    rate = round(fallback / total, 3) if total else 0.0
    return {
        "generated": generated,
        "fallback": fallback,
        "total": total,
        "fallback_rate": rate,
    }

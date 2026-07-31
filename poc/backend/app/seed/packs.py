"""시나리오 팩 로더 (S-B2B-PACK) — JSON 팩 파일을 DB 시나리오로 적재한다.

팩 = 직무 하나의 완결된 훈련 콘텐츠 묶음:
  페르소나(캐릭터·리액션 풀·TTS) + 상황(에피소드·체크리스트·압박/심화 질문)
  + 루브릭 가중치(직무별 4-Fit 배점) + 도메인 태그 + 감정 프로파일 + 결말 분기

파일 위치: app/seed/packs/*.json — 파일 하나가 시나리오 하나다.
콘텐츠 작성자는 파이썬을 몰라도 JSON만으로 새 직무를 추가할 수 있다.
적재는 seed()에서 호출되어 서버 기동 시 멱등으로 반영된다.
"""
import json
from pathlib import Path

from app.models import Episode, Scenario, Turn

PACKS_DIR = Path(__file__).resolve().parent / "packs"

REQUIRED_KEYS = ("slug", "title", "characters", "episodes")
EPISODE_REQUIRED_KEYS = ("order", "title", "character_id", "initial_question")
FIT_KEYS = {"response", "voice", "eye", "posture"}
# 체크리스트 키워드 린트 — 부분 문자열 매칭에서 거의 모든 정상 발화에 명중하는
# 기능어는 허위 커버(케이스·감정 온도·후속 질문·점수 오염)를 일으키므로 거부한다.
# 문맥이 실린 형태("다음에는", "바로 다시", "확인 부탁")로 바꿔 쓸 것.
GENERIC_KEYWORDS = {"확인", "까지", "다음", "바로", "먼저", "그리고", "그냥", "정말", "네", "저"}


class PackError(ValueError):
    """팩 파일 형식 오류 — 어떤 파일의 무엇이 문제인지 담는다."""


def _validate(data: dict, name: str) -> None:
    for key in REQUIRED_KEYS:
        if key not in data:
            raise PackError(f"팩 {name}: 필수 키 '{key}' 누락")
    weights = data.get("rubric_weights") or {}
    if weights:
        unknown = set(weights) - FIT_KEYS
        if unknown:
            raise PackError(f"팩 {name}: 알 수 없는 루브릭 축 {sorted(unknown)}")
        # 4축 전부 명시 강제 — 일부만 적으면 미지정 축이 리포트에서 암묵적으로
        # 기본 가중(0.25)을 받아 팩 의도와 어긋난 총점이 나온다.
        missing_axes = FIT_KEYS - set(weights)
        if missing_axes:
            raise PackError(f"팩 {name}: 루브릭 가중치에 축 {sorted(missing_axes)} 누락 — 4축 모두 명시")
        if any(not isinstance(v, (int, float)) or v < 0 for v in weights.values()):
            raise PackError(f"팩 {name}: 루브릭 가중치는 0 이상의 숫자여야 합니다")
        total = sum(weights.values())
        if not 0.99 <= total <= 1.01:
            raise PackError(f"팩 {name}: 루브릭 가중치 합이 1.0이어야 합니다 (현재 {total})")
    character_ids = {c.get("id") for c in data["characters"]}
    for ep in data["episodes"]:
        for key in EPISODE_REQUIRED_KEYS:
            if key not in ep:
                raise PackError(f"팩 {name}: 에피소드 {ep.get('order', '?')}에 '{key}' 누락")
        if ep["character_id"] not in character_ids:
            raise PackError(
                f"팩 {name}: 에피소드 {ep['order']}의 화자 '{ep['character_id']}'가 characters에 없습니다"
            )
        for item in ep.get("checklist", []):
            generic = [kw for kw in item.get("keywords", []) if kw in GENERIC_KEYWORDS]
            if generic:
                raise PackError(
                    f"팩 {name}: 체크리스트 '{item.get('id')}'의 범용 키워드 {generic} — "
                    "허위 커버를 일으키므로 문맥이 실린 형태로 바꾸세요"
                )
    profile = data.get("emotion_profile") or {}
    if profile.get("enabled") and profile.get("character_id") not in character_ids:
        raise PackError(f"팩 {name}: emotion_profile.character_id가 characters에 없습니다")


def load_pack_files() -> list[dict]:
    """packs/*.json 로드 + 검증. 형식이 깨진 팩은 기동을 막는다(조용한 미적재 방지)."""
    packs = []
    for path in sorted(PACKS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PackError(f"팩 {path.name}: JSON 파싱 실패 — {exc}") from exc
        _validate(data, path.name)
        packs.append(data)
    return packs


def pack_slugs() -> set[str]:
    return {p["slug"] for p in load_pack_files()}


def _upsert_pack_episodes(db, scenario: Scenario, episodes_data: list[dict]) -> None:
    """order 기준 제자리 갱신 — run.py의 에피소드 보존 규칙과 동일.

    id를 보존해야 기존 세션 턴의 episode_id 참조가 재시드 후에도 끊기지 않는다.
    시드에서 사라진 에피소드는 턴이 참조하면 modes=[]로 은퇴, 아니면 삭제.
    """
    current = {
        ep.order: ep
        for ep in db.query(Episode).filter_by(scenario_id=scenario.id).all()
    }
    for data in episodes_data:
        ep = current.pop(data["order"], None)
        if ep is None:
            db.add(Episode(scenario_id=scenario.id, **data))
        else:
            for key, value in data.items():
                setattr(ep, key, value)
    for ep in current.values():
        referenced = db.query(Turn.id).filter_by(episode_id=ep.id).first() is not None
        if referenced:
            ep.modes = []
        else:
            db.delete(ep)


def upsert_pack(db, data: dict) -> Scenario:
    """팩 하나를 시나리오로 적재/갱신 (멱등). 호출자가 커밋한다."""
    scenario = db.query(Scenario).filter_by(slug=data["slug"]).first()
    if scenario is None:
        scenario = Scenario(slug=data["slug"])
        db.add(scenario)
    scenario.title = data["title"]
    scenario.description = data.get("description", "")
    scenario.world_setting = data.get("world_setting", {})
    scenario.characters = data["characters"]
    scenario.domain = data.get("domain", "")
    scenario.job_role = data.get("job_role", "")
    scenario.brand = data.get("brand", "")
    scenario.rubric_weights = data.get("rubric_weights", {})
    scenario.emotion_profile = data.get("emotion_profile", {})
    scenario.dialogue_policy = data.get("dialogue_policy", {})
    scenario.is_active = True
    db.flush()
    _upsert_pack_episodes(db, scenario, data["episodes"])
    return scenario


def seed_packs(db) -> list[str]:
    """모든 팩 적재 — seed()의 마지막 단계에서 호출된다."""
    loaded = []
    for data in load_pack_files():
        upsert_pack(db, data)
        loaded.append(data["slug"])
    return loaded

"""DB 초기화 + 시나리오 시드. `python -m app.seed.run`으로 실행."""
from sqlalchemy import inspect, text

from app.core.database import Base, SessionLocal, engine
from app.models import Episode, Scenario, Turn
from app.seed.seed_data import CHARACTERS, EPISODES, SCENARIO, WORLD_SETTING


def _migrate_columns() -> None:
    """SQLite 경량 마이그레이션 — 모델에 새로 생긴 컬럼을 기존 테이블에 자동 추가.

    create_all은 새 테이블만 만들고 기존 테이블에는 컬럼을 더하지 않는다.
    모델 메타데이터와 실제 스키마를 비교해 누락 컬럼만 ALTER TABLE로 채운다
    (수동 컬럼 목록 유지 시 생기는 누락 사고 방지, 데이터 보존).
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # 신규 테이블은 create_all이 완전한 스키마로 만든다
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                ddl = (
                    f"ALTER TABLE {table.name} ADD COLUMN "
                    f"{col.name} {col.type.compile(engine.dialect)}"
                )
                # 스칼라 기본값만 DDL로 옮긴다 — callable(dict, utcnow 등)은 NULL로 두고
                # 읽는 쪽의 `or {}` 가드가 흡수한다
                default = (
                    col.default.arg
                    if col.default is not None and col.default.is_scalar
                    else None
                )
                if isinstance(default, bool):
                    ddl += f" DEFAULT {int(default)}"
                elif isinstance(default, (int, float)):
                    ddl += f" DEFAULT {default}"
                elif isinstance(default, str):
                    ddl += " DEFAULT '{}'".format(default.replace("'", "''"))
                conn.execute(text(ddl))


def _migrate_modes_json() -> None:
    """episodes.modes 구형 포맷('5,10' 콤마 문자열) → JSON 배열 일회성 변환.

    JSON 컬럼 전환 이전에 만들어진 전시 DB의 행은 json.loads가 불가능한 TEXT라
    엔티티 로드(_upsert_episodes) 시점에 크래시한다. 배열 리터럴이 아닌 값만 감싼다.
    """
    inspector = inspect(engine)
    if "episodes" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        conn.execute(text(
            "UPDATE episodes SET modes = '[]' "
            "WHERE modes IS NULL OR trim(modes) = ''"
        ))
        conn.execute(text(
            "UPDATE episodes SET modes = '[' || modes || ']' "
            "WHERE modes NOT LIKE '[%'"
        ))


def _upsert_episodes(db, scenario: Scenario) -> None:
    """에피소드 시드 갱신 — 삭제 후 재삽입 대신 order 기준 제자리 갱신.

    id를 보존해야 기존 세션 턴의 episode_id 참조(리포트 근거 구간·재도전 비교)가
    서버 재시작 후에도 끊기지 않는다. 시드에서 사라진 에피소드는 턴이 참조하면
    modes=[]로 은퇴시켜 진행(episodes_for_mode)에서만 제외하고, 참조가 없으면 지운다.
    """
    current = {
        ep.order: ep
        for ep in db.query(Episode).filter_by(scenario_id=scenario.id).all()
    }
    for data in EPISODES:
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


def seed(db=None) -> None:
    _migrate_columns()
    _migrate_modes_json()
    Base.metadata.create_all(engine)
    own_session = db is None
    db = db or SessionLocal()
    try:
        from app.seed.packs import load_pack_files, seed_packs

        # 현재 노출할 시나리오 = 기본(전시) 시나리오 + 시나리오 팩(S-B2B-PACK).
        # 그 외(과거 시드 잔재)만 비활성화한다. 기존 체험 기록은 지우지 않는다.
        keep_slugs = {SCENARIO["slug"]} | {p["slug"] for p in load_pack_files()}
        db.query(Scenario).filter(Scenario.slug.notin_(keep_slugs)).update(
            {Scenario.is_active: False}, synchronize_session=False,
        )
        existing = db.query(Scenario).filter_by(slug=SCENARIO["slug"]).first()
        if existing:
            scenario = existing
            scenario.title = SCENARIO["title"]
            scenario.description = SCENARIO["description"]
            scenario.world_setting = WORLD_SETTING
            scenario.characters = CHARACTERS
            _upsert_episodes(db, scenario)
        else:
            scenario = Scenario(
                slug=SCENARIO["slug"],
                title=SCENARIO["title"],
                description=SCENARIO["description"],
                world_setting=WORLD_SETTING,
                characters=CHARACTERS,
            )
            db.add(scenario)
            db.flush()
            for ep in EPISODES:
                db.add(Episode(scenario_id=scenario.id, **ep))
        scenario.is_active = True
        # 도메인 태그 (S-B2B-PACK): 기존 전시 시나리오 = 사무행정 트랙.
        # rubric_weights는 비워 균등 가중 유지 — 기존 점수·골든 회귀와의 호환.
        scenario.domain = "office"
        scenario.job_role = "office_admin"
        loaded = seed_packs(db)
        db.commit()
        print(f"seeded scenario '{scenario.slug}' with {len(EPISODES)} episodes + packs {loaded}")
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    seed()

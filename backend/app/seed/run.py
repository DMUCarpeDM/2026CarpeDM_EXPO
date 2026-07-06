"""DB 초기화 + 시나리오 시드. `python -m app.seed.run`으로 실행."""
from sqlalchemy import inspect, text

from app.core.database import Base, SessionLocal, engine
from app.models import Episode, Scenario
from app.seed.seed_data import CHARACTERS, EPISODES, SCENARIO, WORLD_SETTING

# SQLite 경량 마이그레이션 — 기존 DB에 신규 컬럼만 추가 (데이터 보존).
# create_all은 새 테이블만 만들고 기존 테이블에는 컬럼을 더하지 않는다.
_NEW_COLUMNS: dict[str, dict[str, str]] = {
    "episodes": {"virtual_time": "VARCHAR(10) DEFAULT ''", "intro_variants": "JSON"},
    "turns": {"reaction_text": "TEXT DEFAULT ''", "reaction_character_id": "VARCHAR(50) DEFAULT ''"},
    "roleplay_sessions": {"rapport": "JSON"},
    "reports": {"day_ending": "JSON"},
}


def _migrate_columns() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, cols in _NEW_COLUMNS.items():
            if table not in existing_tables:
                continue  # 신규 테이블은 create_all이 완전한 스키마로 만든다
            existing = {c["name"] for c in inspector.get_columns(table)}
            for col, ddl in cols.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))


def seed(db=None) -> None:
    _migrate_columns()
    Base.metadata.create_all(engine)
    own_session = db is None
    db = db or SessionLocal()
    try:
        existing = db.query(Scenario).filter_by(slug=SCENARIO["slug"]).first()
        if existing:
            # 시드 갱신: 에피소드를 갈아끼운다 (개발 편의)
            db.query(Episode).filter_by(scenario_id=existing.id).delete()
            scenario = existing
            scenario.title = SCENARIO["title"]
            scenario.description = SCENARIO["description"]
            scenario.world_setting = WORLD_SETTING
            scenario.characters = CHARACTERS
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
        db.commit()
        print(f"seeded scenario '{scenario.slug}' with {len(EPISODES)} episodes")
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    seed()

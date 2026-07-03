"""DB 초기화 + 시나리오 시드. `python -m app.seed.run`으로 실행."""
from app.core.database import Base, SessionLocal, engine
from app.models import Episode, Scenario
from app.seed.seed_data import CHARACTERS, EPISODES, SCENARIO, WORLD_SETTING


def seed(db=None) -> None:
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

"""10월 확장 Phase 1 — 테넌시 컬럼 전방 호환.

institution_id/device_id는 nullable로 선반영되어 단일 테넌트(전시) 동작을 바꾸지 않고,
기존 _migrate_columns 경량 마이그레이션이 새 컬럼을 기존 DB에도 무손실 추가한다.
정식 Alembic(FK 제약·인덱스·데이터 마이그레이션)은 Phase 2(PostgreSQL) 몫.
"""
from app.core.database import SessionLocal
from app.models import Device, Institution, RoleplaySession, Scenario, SessionStatus
from app.seed.run import seed


def _first_scenario_id(db) -> int:
    return db.query(Scenario).first().id


def test_tenancy_columns_default_null_for_single_tenant():
    """단일 테넌트(전시) 세션은 테넌시 컬럼이 NULL — 현행 동작 무변화."""
    seed()
    db = SessionLocal()
    try:
        s = RoleplaySession(scenario_id=_first_scenario_id(db), status=SessionStatus.ready)
        db.add(s)
        db.commit()
        assert s.institution_id is None
        assert s.device_id is None
    finally:
        db.close()


def test_session_can_be_scoped_to_institution_and_device():
    """Phase 2 준비 — 세션을 기관·기기로 스코프할 수 있다 (전방 호환 확인)."""
    seed()
    db = SessionLocal()
    try:
        inst = Institution(name="동양미래대 취업지원센터", code="dm-career-1")
        db.add(inst)
        db.flush()
        dev = Device(institution_id=inst.id, name="미러 키오스크 1")
        db.add(dev)
        db.flush()
        s = RoleplaySession(
            scenario_id=_first_scenario_id(db), status=SessionStatus.ready,
            institution_id=inst.id, device_id=dev.id,
        )
        db.add(s)
        db.commit()
        loaded = db.get(RoleplaySession, s.id)
        assert loaded.institution_id == inst.id
        assert loaded.device_id == dev.id
    finally:
        db.close()

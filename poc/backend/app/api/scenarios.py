from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Scenario
from app.schemas import ScenarioOut

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def to_scenario_out(scenario: Scenario) -> ScenarioOut:
    titles: dict[str, list[str]] = {"5": [], "10": []}
    active_episodes = sorted(
        (ep for ep in scenario.episodes if ep.modes),
        key=lambda ep: ep.selection_order or ep.order,
    )
    for ep in active_episodes:
        for mode in (5, 10):
            if mode in ep.modes:
                titles[str(mode)].append(ep.title)
    return ScenarioOut(
        id=scenario.id,
        slug=scenario.slug,
        title=scenario.title,
        description=scenario.description,
        world_setting=scenario.world_setting,
        characters=scenario.characters,
        # 팩 메타 (S-B2B-PACK): NFC 없는 웹앱이 직무로 시나리오를 고르는 축.
        # 구형 행(팩 이전 시드)은 컬럼이 NULL일 수 있어 or ""로 흡수한다.
        job_role=scenario.job_role or "",
        domain=scenario.domain or "",
        brand=scenario.brand or "",
        episode_titles=titles,
        episodes=[
            {
                "id": ep.id,
                "title": ep.title,
                "situation": ep.situation,
                "intent": ep.question_intent,
                "points": [item["label"] for item in ep.checklist],
                "character_id": ep.character_id,
                "modes": ep.modes,
            }
            for ep in active_episodes
        ],
    )


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(db: Session = Depends(get_db)):
    scenarios = db.query(Scenario).filter_by(is_active=True).all()
    return [to_scenario_out(s) for s in scenarios]


@router.get("/{slug}", response_model=ScenarioOut)
def get_scenario(slug: str, db: Session = Depends(get_db)):
    scenario = db.query(Scenario).filter_by(slug=slug, is_active=True).first()
    if scenario is None:
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")
    return to_scenario_out(scenario)

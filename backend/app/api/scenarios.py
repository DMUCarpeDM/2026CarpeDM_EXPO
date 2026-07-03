from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Scenario
from app.schemas import ScenarioOut

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def to_scenario_out(scenario: Scenario) -> ScenarioOut:
    titles: dict[str, list[str]] = {"5": [], "10": []}
    for ep in scenario.episodes:
        for mode in ("5", "10"):
            if mode in ep.modes.split(","):
                titles[mode].append(ep.title)
    return ScenarioOut(
        id=scenario.id,
        slug=scenario.slug,
        title=scenario.title,
        description=scenario.description,
        world_setting=scenario.world_setting,
        characters=scenario.characters,
        episode_titles=titles,
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

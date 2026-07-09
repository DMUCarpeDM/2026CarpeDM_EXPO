"""체험 코드·연습 히스토리 API (F-SFIWUO 익명 ID, S-XUUODK 개인별 추이).

개인 식별 정보 없이 4자리 코드 하나로 연습 기록을 이어간다:
- 리포트 화면에서 코드 발급 → 다음 방문(또는 다른 기기)에서 코드 입력 → 추이 연결
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import AnonymousId, RoleplaySession, SessionStatus

router = APIRouter(tags=["codes"])

# 혼동되는 문자(0/O, 1/I/L) 제외
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 4


class CodeIn(BaseModel):
    client_key: str


class CodeOut(BaseModel):
    code: str


class ClaimOut(BaseModel):
    client_key: str


def _generate_code(db: Session) -> str:
    for _ in range(30):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if not db.query(AnonymousId).filter_by(code=code).first():
            return code
    raise HTTPException(status_code=500, detail="코드 생성에 실패했습니다")


@router.post("/codes", response_model=CodeOut)
def issue_code(body: CodeIn, db: Session = Depends(get_db)):
    if not body.client_key:
        raise HTTPException(status_code=422, detail="client_key가 필요합니다")
    existing = db.query(AnonymousId).filter_by(client_key=body.client_key).first()
    if existing:
        return CodeOut(code=existing.code)
    anon = AnonymousId(code=_generate_code(db), client_key=body.client_key)
    db.add(anon)
    try:
        db.commit()
    except IntegrityError:
        # 동시 요청이 같은 client_key로 먼저 발급한 경우 — 그 코드를 돌려준다
        db.rollback()
        existing = db.query(AnonymousId).filter_by(client_key=body.client_key).first()
        if existing is None:
            raise
        return CodeOut(code=existing.code)
    return CodeOut(code=anon.code)


@router.post("/codes/{code}/claim", response_model=ClaimOut)
def claim_code(code: str, db: Session = Depends(get_db)):
    anon = db.query(AnonymousId).filter_by(code=code.strip().upper()).first()
    if anon is None:
        raise HTTPException(status_code=404, detail="등록되지 않은 코드입니다")
    return ClaimOut(client_key=anon.client_key)


@router.get("/history")
def practice_history(client_key: str, db: Session = Depends(get_db)):
    """완료된 세션의 점수 추이 (최근 10회, 시간순)."""
    sessions = (
        db.query(RoleplaySession)
        .filter(
            RoleplaySession.client_key == client_key,
            RoleplaySession.status == SessionStatus.completed,
        )
        .order_by(RoleplaySession.id.desc())
        .limit(10)
        .all()
    )
    items = []
    for s in reversed(sessions):
        if not s.report:
            continue
        items.append({
            "session_id": s.id,
            "started_at": s.started_at.isoformat(timespec="seconds") if s.started_at else "",
            "mode": s.mode,
            "difficulty": s.difficulty,
            "total_score": s.report.total_score,
            "fit_scores": {
                fit: data.get("score") for fit, data in s.report.fit_scores.items()
            },
        })
    return {"items": items}

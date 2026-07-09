import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import User


def require_admin(x_admin_token: str = Header(default="")) -> None:
    """운영 API 보호 — 토큰이 설정된 경우에만 헤더를 대조한다 (미설정 = 개발 모드)."""
    if settings.admin_token and not secrets.compare_digest(
        x_admin_token, settings.admin_token
    ):
        raise HTTPException(status_code=401, detail="운영 토큰이 올바르지 않습니다")


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다")
    subject = decode_access_token(authorization.removeprefix("Bearer "))
    user = db.get(User, int(subject)) if subject else None
    if user is None:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")
    return user


def get_optional_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User | None:
    if not authorization.startswith("Bearer "):
        return None
    subject = decode_access_token(authorization.removeprefix("Bearer "))
    return db.get(User, int(subject)) if subject else None

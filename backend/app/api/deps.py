from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import User


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


def require_admin(user: User | None = Depends(get_optional_user)) -> User | None:
    """관리자 가드 — 전시 모드(admin_auth_required=False)에서는 통과시키되 감사 로그용
    사용자만 전달하고, 기관 모드에서는 role='admin' 토큰을 강제한다."""
    if not settings.admin_auth_required:
        return user
    if user is None or user.role != "admin":
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
    return user

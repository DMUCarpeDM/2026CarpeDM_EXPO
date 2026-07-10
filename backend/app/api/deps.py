import secrets

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import RoleplaySession, User

# 루프백(같은 PC)으로 간주하는 호스트 — 토큰 미설정 시 운영 API를 여기서만 허용.
# "testclient"는 Starlette TestClient의 기본 호스트(실서비스 트래픽엔 나타나지 않는다).
_LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}


def require_admin(request: Request, x_admin_token: str = Header(default="")) -> None:
    """운영 API 보호. 토큰이 설정돼 있으면 헤더를 대조하고, 미설정(개발 편의)이면
    부스 LAN 노출을 막기 위해 루프백 요청만 허용한다."""
    if settings.admin_token:
        if not secrets.compare_digest(x_admin_token, settings.admin_token):
            raise HTTPException(status_code=401, detail="운영 토큰이 올바르지 않습니다")
        return
    host = request.client.host if request.client else ""
    if host not in _LOOPBACK:
        raise HTTPException(
            status_code=403,
            detail="운영 토큰이 설정되지 않아 로컬(같은 PC)에서만 접근할 수 있습니다",
        )


def require_session(
    session_id: int,
    x_session_token: str = Header(default=""),
    db: Session = Depends(get_db),
) -> RoleplaySession:
    """세션 소유 검증 — 생성 시 발급한 능력 토큰이 있어야 세션 데이터에 접근한다.
    순차 정수 id를 열거해 타인의 발화·리포트를 읽는 IDOR를 차단한다."""
    session = db.get(RoleplaySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    token = session.access_token or ""
    if not token or not secrets.compare_digest(x_session_token, token):
        raise HTTPException(status_code=403, detail="세션 접근 권한이 없습니다")
    return session


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

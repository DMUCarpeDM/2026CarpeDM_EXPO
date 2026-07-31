"""관리자 승격 CLI — 기관 모드(MIRROR_TING_ADMIN_AUTH_REQUIRED=true) 운영자 계정 준비.

실행: python -m app.seed.make_admin <email>
(먼저 /api/auth/signup으로 가입되어 있어야 한다)
"""
import sys

from app.core.database import SessionLocal
from app.models import User


def main() -> None:
    if len(sys.argv) != 2:
        print("사용법: python -m app.seed.make_admin <email>")
        raise SystemExit(1)
    email = sys.argv[1]
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).first()
        if user is None:
            print(f"가입된 사용자가 없습니다: {email} — 먼저 /api/auth/signup으로 가입하세요")
            raise SystemExit(1)
        user.role = "admin"
        db.commit()
        print(f"관리자 승격 완료: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

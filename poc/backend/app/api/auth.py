from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas import LoginIn, SignupIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다")
    user = User(email=body.email, password_hash=hash_password(body.password), name=body.name)
    db.add(user)
    # 초대 코드 가입 (S-B2B-ORG) — 코드가 틀리면 계정도 만들지 않는다 (혼란 방지:
    # "가입은 됐는데 기관이 없다"보다 화면에서 코드를 고쳐 재시도하는 편이 낫다)
    if body.invite_code:
        from app.api.orgs import join_org_by_invite

        db.flush()
        join_org_by_invite(db, user, body.invite_code)
    db.commit()
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user

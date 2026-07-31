from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas import JobRoleIn, LoginIn, SignupIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    from app.api.orgs import JOB_ROLES, join_org_by_invite

    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다")
    # 직무는 초대 코드와 독립 검증 — 웹앱(NFC 없음)은 가입 화면에서 직무를 고른다
    if body.job_role and body.job_role not in JOB_ROLES:
        raise HTTPException(status_code=422, detail="알 수 없는 직무입니다")
    user = User(email=body.email, password_hash=hash_password(body.password), name=body.name)
    db.add(user)
    # 초대 코드 가입 (S-B2B-ORG) — 코드가 틀리면 계정도 만들지 않는다 (혼란 방지:
    # "가입은 됐는데 기관이 없다"보다 화면에서 코드를 고쳐 재시도하는 편이 낫다)
    if body.invite_code:
        db.flush()
        join_org_by_invite(db, user, body.invite_code, body.job_role)
    elif body.job_role:
        user.job_role = body.job_role  # 무소속(개인 연습) 사용자도 직무 트랙을 가진다
    db.commit()
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.patch("/me", response_model=UserOut)
def update_me(
    body: JobRoleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """본인 직무 변경 (S-B2B-PACK) — 웹앱 프로필의 직무 선택.

    직무는 시나리오 추천·대시보드 집계 축일 뿐 권한이 아니므로 본인 수정을
    허용한다 (기관 소속·org_role은 초대 코드 경로로만 변경된다).
    """
    from app.api.orgs import JOB_ROLES

    if body.job_role not in JOB_ROLES:
        raise HTTPException(status_code=422, detail="알 수 없는 직무입니다")
    user.job_role = body.job_role
    db.commit()
    return user


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user

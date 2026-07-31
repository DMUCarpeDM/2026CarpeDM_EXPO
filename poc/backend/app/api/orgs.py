"""기관(B2B 온보딩) 모듈 (S-B2B-ORG) — 기관 생성·초대 코드 가입·멤버·세션 조회.

권한 모델:
- 시스템 관리자(User.role == 'admin' 또는 운영 토큰): 기관 생성·모든 기관 열람.
- 기관 매니저(User.org_role == 'manager'): 자기 기관의 멤버·세션·초대 코드 열람(읽기 전용 대시보드).
- 수강생(User.org_role == 'trainee'): 자기 기관 기본 정보만.
스코프 규칙: 어떤 경로로도 다른 기관의 데이터가 열람되지 않아야 한다
(tests/test_org_scope.py가 이 규약을 고정한다).
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models import Institution, InviteCode, Report, RoleplaySession, Scenario, User
from app.schemas import (
    InviteOut,
    OrgCreateIn,
    OrgDetailOut,
    OrgJoinIn,
    OrgMemberOut,
    OrgOut,
    OrgSessionListOut,
    OrgSessionOut,
)
from app.services.score_policy import grade_of

router = APIRouter(prefix="/orgs", tags=["orgs"])

JOB_ROLES = {"cafe_crew", "cs_agent", "office_admin"}


def _new_invite_code() -> str:
    # 사람이 불러줄 수 있는 짧은 코드 — 대문자/숫자 8자 (혼동 문자 제외)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _is_sysadmin(user: User | None) -> bool:
    return user is not None and user.role == "admin"


def require_org_view(
    org_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Institution:
    """기관 스코프 가드 — 시스템 관리자이거나 해당 기관 매니저만 통과한다."""
    org = db.get(Institution, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="기관을 찾을 수 없습니다")
    if _is_sysadmin(user):
        return org
    if user.institution_id == org_id and user.org_role == "manager":
        return org
    # 403이 아니라 404: 열거 공격에 기관 존재 여부를 흘리지 않는다
    raise HTTPException(status_code=404, detail="기관을 찾을 수 없습니다")


def join_org_by_invite(db: Session, user: User, invite_code: str, job_role: str = "") -> Institution:
    """초대 코드로 기관 가입 — signup과 /orgs/join이 공유하는 단일 경로."""
    code = invite_code.strip().upper()
    invite = db.query(InviteCode).filter_by(code=code, is_active=True).first()
    if invite is None:
        raise HTTPException(status_code=404, detail="유효하지 않은 초대 코드입니다")
    if user.institution_id and user.institution_id != invite.institution_id:
        raise HTTPException(status_code=409, detail="이미 다른 기관에 소속되어 있습니다")
    user.institution_id = invite.institution_id
    user.org_role = invite.org_role
    if job_role:
        if job_role not in JOB_ROLES:
            raise HTTPException(status_code=422, detail="알 수 없는 직무입니다")
        user.job_role = job_role
    return invite.institution


@router.post("", response_model=OrgDetailOut, status_code=201)
def create_org(
    body: OrgCreateIn,
    db: Session = Depends(get_db),
    _admin: User | None = Depends(require_admin),
):
    """기관 생성 (시스템 관리자) — 수강생/매니저 초대 코드가 함께 발급된다."""
    if db.query(Institution).filter_by(code=body.code).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 기관 코드입니다")
    org = Institution(name=body.name, code=body.code)
    db.add(org)
    db.flush()
    for org_role in ("trainee", "manager"):
        db.add(InviteCode(institution_id=org.id, code=_new_invite_code(), org_role=org_role))
    db.commit()
    return _org_detail(db, org)


def _org_detail(db: Session, org: Institution) -> OrgDetailOut:
    member_count = db.query(func.count(User.id)).filter_by(institution_id=org.id).scalar() or 0
    return OrgDetailOut(
        id=org.id, name=org.name, code=org.code,
        invites=[InviteOut.model_validate(i) for i in org.invites if i.is_active],
        member_count=member_count,
    )


@router.get("/me", response_model=OrgOut)
def my_org(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """내 소속 기관 — 수강생·매니저 공통 (초대 코드는 노출하지 않는다)."""
    if not user.institution_id:
        raise HTTPException(status_code=404, detail="소속된 기관이 없습니다")
    org = db.get(Institution, user.institution_id)
    if org is None:
        raise HTTPException(status_code=404, detail="소속된 기관이 없습니다")
    return org


@router.post("/join", response_model=OrgOut)
def join_org(
    body: OrgJoinIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """초대 코드로 기관 가입 — 기존 계정에 소속·역할·직무를 부여한다."""
    org = join_org_by_invite(db, user, body.invite_code, body.job_role)
    db.commit()
    return org


@router.get("/{org_id}", response_model=OrgDetailOut)
def get_org(
    org: Institution = Depends(require_org_view),
    db: Session = Depends(get_db),
):
    return _org_detail(db, org)


@router.post("/{org_id}/invites/rotate", response_model=OrgDetailOut)
def rotate_invites(
    org: Institution = Depends(require_org_view),
    db: Session = Depends(get_db),
):
    """초대 코드 회전 — 기존 코드를 비활성화하고 새 코드를 발급한다 (유출 대응)."""
    for invite in org.invites:
        invite.is_active = False
    for org_role in ("trainee", "manager"):
        db.add(InviteCode(institution_id=org.id, code=_new_invite_code(), org_role=org_role))
    db.commit()
    db.refresh(org)
    return _org_detail(db, org)


@router.get("/{org_id}/members", response_model=list[OrgMemberOut])
def list_members(
    org: Institution = Depends(require_org_view),
    db: Session = Depends(get_db),
):
    """기관 멤버 목록 (읽기 전용) — 세션 수·최근 연습 시각 요약 포함."""
    rows = (
        db.query(
            User,
            func.count(RoleplaySession.id),
            func.max(RoleplaySession.started_at),
        )
        .outerjoin(RoleplaySession, RoleplaySession.user_id == User.id)
        .filter(User.institution_id == org.id)
        .group_by(User.id)
        .order_by(User.id)
        .all()
    )
    return [
        OrgMemberOut(
            id=user.id, email=user.email, name=user.name,
            org_role=user.org_role, job_role=user.job_role,
            session_count=count,
            last_session_at=last.isoformat() if last else None,
        )
        for user, count, last in rows
    ]


@router.get("/{org_id}/sessions", response_model=OrgSessionListOut)
def list_org_sessions(
    org: Institution = Depends(require_org_view),
    db: Session = Depends(get_db),
    job_role: str = Query(default=""),
    user_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """기관 세션 목록 (S-B2B-SESSION) — 대시보드 v1의 읽기 전용 데이터 소스.

    스코프: institution_id가 이 기관인 세션만. 익명(전시) 세션은 기관에
    귀속(claim)된 뒤에야 여기 나타난다.
    """
    query = (
        db.query(RoleplaySession, User, Scenario, Report)
        .outerjoin(User, RoleplaySession.user_id == User.id)
        .join(Scenario, RoleplaySession.scenario_id == Scenario.id)
        .outerjoin(Report, Report.session_id == RoleplaySession.id)
        .filter(RoleplaySession.institution_id == org.id)
    )
    if job_role:
        query = query.filter(RoleplaySession.job_role == job_role)
    if user_id is not None:
        query = query.filter(RoleplaySession.user_id == user_id)
    total = query.count()
    rows = query.order_by(RoleplaySession.id.desc()).offset(offset).limit(limit).all()
    items = [
        OrgSessionOut(
            id=session.id,
            user_id=session.user_id,
            user_name=user.name if user else "",
            user_email=user.email if user else "",
            job_role=session.job_role or "",
            scenario_title=scenario.title,
            mode=session.mode,
            difficulty=session.difficulty,
            status=session.status.value,
            started_at=session.started_at.isoformat() if session.started_at else "",
            total_score=report.total_score if report else None,
            grade=grade_of(report.total_score if report else None),
            fit_scores=(report.fit_scores or {}) if report else {},
        )
        for session, user, scenario, report in rows
    ]
    return OrgSessionListOut(total=total, items=items)

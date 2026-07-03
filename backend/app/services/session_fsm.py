"""세션 상태머신 (S-IPACBL).

ready → in_progress → analyzing → completed
어느 상태에서든 aborted 가능 (전시 운영자 초기화).
"""
from app.models import RoleplaySession, SessionStatus

ALLOWED = {
    SessionStatus.ready: {SessionStatus.in_progress, SessionStatus.aborted},
    SessionStatus.in_progress: {SessionStatus.analyzing, SessionStatus.aborted},
    SessionStatus.analyzing: {SessionStatus.completed, SessionStatus.aborted},
    SessionStatus.completed: set(),
    SessionStatus.aborted: set(),
}


class InvalidTransition(Exception):
    pass


def transition(session: RoleplaySession, to: SessionStatus) -> None:
    if to not in ALLOWED[session.status]:
        raise InvalidTransition(f"{session.status.value} → {to.value} 전이는 허용되지 않습니다")
    session.status = to

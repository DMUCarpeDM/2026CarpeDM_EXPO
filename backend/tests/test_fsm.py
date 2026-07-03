import pytest

from app.models import RoleplaySession, SessionStatus
from app.services.session_fsm import InvalidTransition, transition


def make_session(status: SessionStatus) -> RoleplaySession:
    return RoleplaySession(id=1, scenario_id=1, status=status)


def test_happy_path():
    s = make_session(SessionStatus.ready)
    transition(s, SessionStatus.in_progress)
    transition(s, SessionStatus.analyzing)
    transition(s, SessionStatus.completed)
    assert s.status == SessionStatus.completed


def test_abort_from_any_active_state():
    for status in (SessionStatus.ready, SessionStatus.in_progress, SessionStatus.analyzing):
        s = make_session(status)
        transition(s, SessionStatus.aborted)
        assert s.status == SessionStatus.aborted


def test_invalid_transitions_raise():
    s = make_session(SessionStatus.ready)
    with pytest.raises(InvalidTransition):
        transition(s, SessionStatus.completed)
    done = make_session(SessionStatus.completed)
    with pytest.raises(InvalidTransition):
        transition(done, SessionStatus.in_progress)

from unittest.mock import Mock
import subprocess

import httpx
import pytest

from app.core.config import settings
from app.services.iris_runtime import IrisRuntime
from app.services import iris_runtime, iris_tts


def offline(*args, **kwargs):
    raise httpx.ConnectError('offline')


def test_runtime_does_not_spawn_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, 'iris_autostart', False)
    spawn = Mock()
    monkeypatch.setattr(iris_runtime.subprocess, 'Popen', spawn)
    IrisRuntime().start()
    spawn.assert_not_called()


def test_runtime_preserves_external_server(monkeypatch):
    monkeypatch.setattr(settings, 'iris_autostart', True)
    monkeypatch.setattr(httpx, 'get', lambda *a, **kw: httpx.Response(200, request=httpx.Request('GET', 'http://localhost/health')))
    spawn = Mock()
    monkeypatch.setattr(iris_runtime.subprocess, 'Popen', spawn)
    runtime = IrisRuntime()
    runtime.start()
    runtime.stop()
    spawn.assert_not_called()


def test_runtime_spawns_real_mode_and_stops_owned_process(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, 'iris_autostart', True)
    monkeypatch.setattr(settings, 'iris_voice_base_url', 'http://127.0.0.1:18765')
    monkeypatch.setattr(settings, 'iris_runtime_dir', tmp_path)
    monkeypatch.setattr(httpx, 'get', offline)
    python = tmp_path / '.venv-voice' / ('Scripts/python.exe' if iris_runtime.os.name == 'nt' else 'bin/python')
    python.parent.mkdir(parents=True)
    python.touch()
    process = Mock()
    process.poll.return_value = None
    spawn = Mock(return_value=process)
    monkeypatch.setattr(iris_runtime.subprocess, 'Popen', spawn)
    runtime = IrisRuntime()
    runtime.start()
    assert spawn.call_args.kwargs['env']['VOICE_RUNTIME_MOCK'] == '0'
    assert spawn.call_args.kwargs['cwd'] == tmp_path
    assert spawn.call_args.args[0][0] == str(python)
    runtime.stop()
    process.terminate.assert_called_once()
    process.wait.assert_called_once_with(timeout=5)
    assert runtime.process is None


def test_runtime_kills_only_owned_process_after_timeout():
    runtime = IrisRuntime()
    runtime.process = process = Mock()
    process.poll.return_value = None
    process.wait.side_effect = [subprocess.TimeoutExpired('iris', 5), 0]
    runtime.stop()
    process.kill.assert_called_once()
    assert runtime.process is None


@pytest.mark.parametrize('profile', [{'available': False}, [], {}])
def test_iris_health_requires_profile(monkeypatch, profile):
    monkeypatch.setattr(iris_tts, '_CACHE', {'at': 0.0, 'ready': False})
    def get(url, **kw):
        payload = profile if url.endswith('/v1/voice/profile') else {'status': 'ok', 'mock_mode': False}
        return httpx.Response(200, json=payload, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx, 'get', get)
    assert not iris_tts.iris_female_ready()

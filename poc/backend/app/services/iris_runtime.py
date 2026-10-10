"""백엔드가 시작한 Iris 프로세스만 종료한다. 외부 실행 서버는 소유하지 않는다."""

import logging
import os
import subprocess

import httpx

from app.core.config import settings

LOGGER = logging.getLogger(__name__)


class IrisRuntime:
    def __init__(self):
        self.process = None

    def start(self):
        if not settings.iris_autostart:
            return
        # 다른 PC/포트의 서버 설정은 사용자가 관리한다.
        if settings.iris_voice_base_url.rstrip('/') != 'http://127.0.0.1:18765':
            return
        try:
            httpx.get(f'{settings.iris_voice_base_url}/health', timeout=1.0).raise_for_status()
            return
        except httpx.HTTPError:
            pass
        root = settings.iris_runtime_dir.resolve()
        python = root / '.venv-voice' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        if not python.is_file():
            LOGGER.warning('Iris 환경 미설치: scripts/setup-iris-gtx1060.ps1 실행 필요. 브라우저 음성을 사용합니다.')
            return
        try:
            logs = root / '.logs'
            logs.mkdir(exist_ok=True)
            with (logs / 'runtime.log').open('ab') as log:
                self.process = subprocess.Popen(
                    [str(python), '-m', 'services.voice_runtime.app'],
                    cwd=root,
                    env={**os.environ, 'VOICE_RUNTIME_MOCK': '0', 'PYTHONUTF8': '1'},
                    stdout=log, stderr=subprocess.STDOUT,
                )
        except OSError:
            LOGGER.exception('Iris 실행 실패. 브라우저 음성을 사용합니다.')

    def stop(self):
        if self.process is None:
            return
        try:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=5)
        finally:
            self.process = None

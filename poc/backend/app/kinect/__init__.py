"""Azure Kinect DK 캡처 — 뎁스 기반 자세 측정 (전시 미러 상단 거치 전제).

브라우저는 Kinect에 접근할 수 없으므로 이 패키지가 센서를 열고 지표를 만든다.
기존 백엔드 채점(app/ai/nonverbal.py)은 그대로 두고, NonverbalIn 페이로드를
채우는 '생산자'만 브라우저 MediaPipe에서 이쪽으로 옮기는 구조다.

모듈 구성:
  k4a.py       ctypes 바인딩 (k4a.dll + k4abt.dll) — Windows 전용
  geometry.py  중력 정렬·관절 지표 (순수 numpy — 하드웨어 없이 테스트 가능)
  device.py    장치 수명 관리 + 바디 트래킹 루프
  smoke.py     실기기 스모크: python -m app.kinect.smoke
"""

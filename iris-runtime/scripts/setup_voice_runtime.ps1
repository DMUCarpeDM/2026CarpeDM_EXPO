param(
    [string]$PythonExe = "py",
    [string]$VenvPath = ".venv-voice",
    [switch]$Full
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path $VenvPath)) {
    & $PythonExe -3 -m venv $VenvPath
}

$Py = Join-Path $VenvPath "Scripts/python.exe"
$Pip = Join-Path $VenvPath "Scripts/pip.exe"

# 일부 네트워크는 pytorch.org(CloudFront)로 가는 IPv6 경로가 blackhole이라,
# 표준 socket.getaddrinfo가 IPv6를 먼저 반환하면 다운로드가 사실상 멈춘 것처럼
# 보일 만큼 오래 걸린다(curl은 Happy-Eyeballs로 우회하지만 Python 기본 소켓은
# 아니다). 이 venv 전용으로 getaddrinfo가 IPv4를 먼저 주도록 sitecustomize를
# 심어 우회한다 — 시스템 네트워크 설정은 건드리지 않는다.
$SitePkgs = Join-Path $VenvPath "Lib/site-packages"
New-Item -ItemType Directory -Force -Path $SitePkgs | Out-Null
@'
"""IPv6 라우팅이 깨진 네트워크에서 pip 다운로드가 무한정 정체되는 것을 막는다."""
import socket

_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_first_getaddrinfo(*args, **kwargs):
    results = _orig_getaddrinfo(*args, **kwargs)
    return sorted(results, key=lambda r: 0 if r[0] == socket.AF_INET else 1)


socket.getaddrinfo = _ipv4_first_getaddrinfo
'@ | Set-Content -Path (Join-Path $SitePkgs "sitecustomize.py") -Encoding utf8

# --timeout으로 한 번의 느린/막힌 연결 시도를 짧게 끊고 pip 자체 재시도로 넘어가게
# 한다 — 이게 없으면 나쁜 경로 하나에 걸렸을 때 상위 프로세스 타임아웃(수 시간)까지
# 조용히 멈춰 있는 것처럼 보인다. torch(CUDA) 휠은 2.7GB라 연결이 한두 번 끊기는
# 건 정상이므로 재시도 횟수를 넉넉히 준다 — pip는 중단된 다운로드를 이어받는다.
$PipNet = @("--timeout=60", "--retries=15")

& $Py -m pip install --upgrade pip @PipNet
& $Pip install @PipNet -r "services/voice_runtime/requirements-voice-mock.txt"
& $Pip install @PipNet -r "services/voice_runtime/requirements-voice.txt"

if ($Full) {
    Write-Host "Installing full voice models (CUDA torch, qwen-tts, Faster Qwen streaming)..."
    & $Pip install @PipNet torch --index-url https://download.pytorch.org/whl/cu128
    & $Pip install @PipNet qwen-tts
    & $Pip install @PipNet -r "services/voice_runtime/requirements-voice-full.txt"
}

Write-Host "voice runtime ready:" $Py
Write-Host "Iris TTS 기본: mock 해제 (Qwen). 개발 검증만 VOICE_RUNTIME_MOCK=1"
Write-Host "bind: 127.0.0.1:18765 only (8765 is Iris control surface)"
if (-not $Full) {
    Write-Host "tip: re-run with -Full to install torch/qwen-tts for real TTS"
}

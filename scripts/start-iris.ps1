param([string]$RuntimePath = (Join-Path $PSScriptRoot "../iris-runtime"))
$ErrorActionPreference = "Stop"
$RuntimePath = (Resolve-Path $RuntimePath).Path
$Python = Join-Path $RuntimePath ".venv-voice/Scripts/python.exe"
if (!(Test-Path $Python)) { throw "Run scripts/setup-iris-gtx1060.ps1 first." }
$env:VOICE_RUNTIME_MOCK = "0"
Push-Location $RuntimePath
try {
    & $Python -c "import qwen_tts, torch; from services.voice_runtime.voice_profile import load_default_profile; assert load_default_profile() is not None, 'Missing voice profile'; print('CUDA:', torch.cuda.is_available()); print('Model: Qwen/Qwen3-TTS-12Hz-0.6B-Base')"
    if ($LASTEXITCODE -ne 0) { throw "Iris dependency/profile check failed." }
    & $Python -m services.voice_runtime.app
    if ($LASTEXITCODE -ne 0) { throw "Iris runtime exited with an error." }
} finally { Pop-Location }

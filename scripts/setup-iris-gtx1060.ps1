param([string]$RuntimePath = (Join-Path $PSScriptRoot "../iris-runtime"))
$ErrorActionPreference = "Stop"
$RuntimePath = (Resolve-Path $RuntimePath).Path
$Constraints = Join-Path $PSScriptRoot "iris-gtx1060-constraints.txt"
Push-Location $RuntimePath
try {
    if (!(Test-Path ".venv-voice/Scripts/python.exe")) {
        & py -3.12 -m venv .venv-voice
        if ($LASTEXITCODE -ne 0) { throw "Python 3.12 venv creation failed." }
    }
    $Python = Join-Path $RuntimePath ".venv-voice/Scripts/python.exe"
    & $Python -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }
    & $Python -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu126
    if ($LASTEXITCODE -ne 0) { throw "CUDA 12.6 torch installation failed." }
    & $Python -m pip install -c $Constraints -r services/voice_runtime/requirements-voice.txt qwen-tts
    if ($LASTEXITCODE -ne 0) { throw "Voice dependency installation failed." }
    & $Python -m pip check
    if ($LASTEXITCODE -ne 0) { throw "Dependency check failed." }
    & $Python -c "import torch, qwen_tts; assert torch.cuda.is_available(), 'CUDA unavailable'; print(torch.__version__, torch.cuda.get_device_name(0), torch.cuda.get_arch_list()); x=torch.ones(1, device='cuda'); print((x+x).cpu().item())"
    if ($LASTEXITCODE -ne 0) { throw "Actual CUDA operation failed; check driver and wheel compatibility." }
} finally { Pop-Location }

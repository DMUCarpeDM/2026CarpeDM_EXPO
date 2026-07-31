# 미러팅 전시 시작 스크립트 (Windows) — 더블클릭 또는 pwsh로 실행
# Ollama → 분석 서버(8001) → MVP 프론트(5173) 순서로 띄우고 브라우저를 연다.
# 사전 준비(최초 1회)는 WINDOWS-SETUP.md 참조.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# 0) 경로
$ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$backend = Join-Path $root 'poc\backend'
$mvp = Join-Path $root 'mvp'
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$env:PYTHONUTF8 = '1'

function Wait-Url([string]$url, [int]$tries = 30) {
    foreach ($i in 1..$tries) {
        & "$env:SystemRoot\System32\curl.exe" -s --max-time 3 $url | Out-Null
        if ($LASTEXITCODE -eq 0) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

# 1) Ollama (EXAONE은 f16 KV 캐시 필수)
& "$env:SystemRoot\System32\curl.exe" -s --max-time 3 http://localhost:11434/api/version | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[1/3] Ollama 서버 시작...'
    $env:OLLAMA_KV_CACHE_TYPE = 'f16'
    $env:OLLAMA_FLASH_ATTENTION = '0'
    Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
    if (-not (Wait-Url 'http://localhost:11434/api/version')) { throw 'Ollama가 응답하지 않습니다' }
} else { Write-Host '[1/3] Ollama 이미 실행 중' }

# 2) 분석 서버 (FastAPI :8001) — 로그를 파일로 남긴다: 조용히 죽었을 때
#    "장면이 없어요" 같은 2차 증상만 남고 사인을 알 수 없던 문제의 재발 방지
& "$env:SystemRoot\System32\curl.exe" -s --max-time 3 http://127.0.0.1:8001/api/health | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[2/3] 분석 서버 시작... (로그: poc\backend\backend-dev.log)'
    Start-Process -FilePath (Join-Path $backend '.venv\Scripts\python.exe') `
        -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001' `
        -WorkingDirectory $backend -WindowStyle Hidden `
        -RedirectStandardError (Join-Path $backend 'backend-dev.log') `
        -RedirectStandardOutput (Join-Path $backend 'backend-dev.out.log')
    if (-not (Wait-Url 'http://127.0.0.1:8001/api/health')) { throw '분석 서버가 응답하지 않습니다' }
} else { Write-Host '[2/3] 분석 서버 이미 실행 중' }

# 3) MVP 프론트엔드 (Vite :5173)
& "$env:SystemRoot\System32\curl.exe" -s --max-time 3 http://localhost:5173 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[3/3] MVP 프론트엔드 시작...'
    Start-Process -FilePath "C:\Program Files\nodejs\npm.cmd" -ArgumentList 'run','dev' `
        -WorkingDirectory $mvp -WindowStyle Hidden
    if (-not (Wait-Url 'http://localhost:5173')) { throw 'Vite 개발 서버가 응답하지 않습니다' }
} else { Write-Host '[3/3] MVP 이미 실행 중' }

# 4) 상태 요약 + 브라우저
$health = & "$env:SystemRoot\System32\curl.exe" -s http://127.0.0.1:8001/api/health
Write-Host "`n/api/health → $health`n"
if ($health -match '"dialogue":\s*false') {
    Write-Warning 'Ollama 대화 모델 미가동 — ollama pull exaone3.5:2.4b 필요 (실제 시뮬레이션 불가)'
}
# +) B2B 웹앱 (Vite :5174, 선택) — 실패해도 전시(1~3단계)에는 영향 없음
& "$env:SystemRoot\System32\curl.exe" -s --max-time 3 http://localhost:5174 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[+] B2B 웹앱 시작... (http://localhost:5174)'
    Start-Process -FilePath "C:\Program Files\nodejs\npm.cmd" -ArgumentList 'run','dev' `
        -WorkingDirectory (Join-Path $root 'poc\frontend') -WindowStyle Hidden
    if (-not (Wait-Url 'http://localhost:5174' 10)) { Write-Warning 'B2B 웹앱이 응답하지 않습니다 (전시에는 영향 없음)' }
} else { Write-Host '[+] B2B 웹앱 이미 실행 중' }

Start-Process 'http://localhost:5173'
Write-Host '전시 준비 완료 — 카메라·마이크 권한을 허용하세요. (B2B 웹앱: http://localhost:5174)'

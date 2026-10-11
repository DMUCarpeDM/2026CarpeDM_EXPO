#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_BIN="${IRIS_PYTHON:-python3.12}"
command -v sox >/dev/null || { echo "SoX가 필요합니다. brew install sox 후 다시 실행하세요."; exit 1; }
"$PYTHON_BIN" -m venv "$TASK_ROOT/iris-runtime/.venv-voice"
"$TASK_ROOT/iris-runtime/.venv-voice/bin/python" -m pip install torch==2.8.0 torchaudio==2.8.0 torchvision==0.23.0 qwen-tts -r "$TASK_ROOT/iris-runtime/services/voice_runtime/requirements-voice.txt"
"$TASK_ROOT/iris-runtime/.venv-voice/bin/python" -m pip check

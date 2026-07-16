#!/usr/bin/env bash
# MediaPipe WASM 런타임 + 얼굴/자세 모델을 public/mediapipe/ 로 내려받습니다.
# 대용량 바이너리(약 42MB)라 git에는 넣지 않고, 최초 1회 이 스크립트로 준비합니다.
# 오프라인 전시 PC에서는 미리 실행해 두면 이후 인터넷 없이 동작합니다.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="public/mediapipe"
WASM_SRC="node_modules/@mediapipe/tasks-vision/wasm"
mkdir -p "$DEST/wasm"

if [ -d "$WASM_SRC" ]; then
  cp "$WASM_SRC"/* "$DEST/wasm/"
  echo "✓ WASM 런타임 복사 완료 ($WASM_SRC → $DEST/wasm)"
else
  echo "✗ $WASM_SRC 가 없습니다. 먼저 'npm install' 을 실행하세요." >&2
  exit 1
fi

FACE_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
POSE_URL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"

curl -fL --retry 3 -o "$DEST/face_landmarker.task" "$FACE_URL"
curl -fL --retry 3 -o "$DEST/pose_landmarker_lite.task" "$POSE_URL"
echo "✓ 모델 다운로드 완료 (face_landmarker, pose_landmarker_lite)"
echo "완료: $DEST 준비됨. 연습 화면에서 실시간 얼굴·자세 추적이 동작합니다."

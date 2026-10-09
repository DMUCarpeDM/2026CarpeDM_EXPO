FROM node:22-bookworm-slim AS frontend

WORKDIR /build/mvp
COPY mvp/package*.json ./
RUN npm ci
COPY mvp/ ./
ARG VITE_SERVICE_MODE=interview
ENV VITE_SERVICE_MODE=${VITE_SERVICE_MODE}
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MIRROR_TING_FRONTEND_DIST_DIR=/app/static \
    MIRROR_TING_DATABASE_URL=sqlite:////app/storage/mirror-ting.db \
    MIRROR_TING_MEDIA_DIR=/app/storage/media \
    MIRROR_TING_STT_WHISPER_MODEL=small \
    MIRROR_TING_REQUIRE_SECURE=true \
    MIRROR_TING_NFC_BRIDGE_ENABLED=false \
    HF_HOME=/app/storage/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY poc/backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY poc/backend/ /app/
COPY --from=frontend /build/mvp/dist /app/static
RUN mkdir -p /app/storage/media

EXPOSE 8001
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]

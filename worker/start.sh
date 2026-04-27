#!/usr/bin/env bash
# Launch the voice worker in a tmux session that survives terminal disconnects.
# Run this from /workspace/voiceapp-worker (or wherever you cloned the repo).
#
# Required env vars (set before invoking, or export in ~/.bashrc):
#   WORKER_BEARER_TOKEN  — shared secret for /train, /cover, /jobs
#
# Optional env vars:
#   APPLIO_DIR           — default /workspace/Applio
#   PORT                 — default 8000
#   LOG_FILE             — default /workspace/voiceapp-worker/worker.log

set -euo pipefail

PORT="${PORT:-8000}"
LOG_FILE="${LOG_FILE:-/workspace/voiceapp-worker/worker.log}"
SESSION="voice-worker"

if [[ -z "${WORKER_BEARER_TOKEN:-}" ]]; then
  echo "ERROR: WORKER_BEARER_TOKEN env var is required" >&2
  exit 1
fi

# Use Applio's venv (already has torch + audio-separator + ffmpeg deps)
APPLIO_DIR="${APPLIO_DIR:-/workspace/Applio}"
VENV_PY="$APPLIO_DIR/.venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: $VENV_PY not found. Install Applio first." >&2
  exit 1
fi

# Install worker deps into Applio's venv (idempotent).
# Applio is set up with `uv` so pip may not exist — try both.
REQ="$(dirname "$0")/requirements.txt"
if "$VENV_PY" -m pip --version >/dev/null 2>&1; then
  "$VENV_PY" -m pip install --quiet -r "$REQ"
elif command -v uv >/dev/null 2>&1; then
  VIRTUAL_ENV="$APPLIO_DIR/.venv" uv pip install --quiet -r "$REQ"
else
  echo "Bootstrapping pip in Applio's venv..."
  "$VENV_PY" -m ensurepip --upgrade --quiet
  "$VENV_PY" -m pip install --quiet -r "$REQ"
fi

# tmux launcher — kill old session if present
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Killing existing tmux session: $SESSION"
  tmux kill-session -t "$SESSION"
fi

mkdir -p "$(dirname "$LOG_FILE")"

# Resolve symlinks first — without realpath, `cd $(dirname start.sh)/..`
# would land in the symlink's parent (e.g. /workspace) instead of the real
# repo root, and Python wouldn't find the `worker` package.
SCRIPT_PATH="$(realpath "$0")"
WORKER_DIR="$(dirname "$(dirname "$SCRIPT_PATH")")"

# Worker calls `audio-separator`, `yt-dlp`, `ffmpeg`, `ffprobe` as bare
# commands — they must be on PATH. audio-separator + yt-dlp live in
# Applio's venv bin; ffmpeg is system-wide.
VENV_BIN="$APPLIO_DIR/.venv/bin"

# /workspace/.bin holds persistent static binaries (ffmpeg/ffprobe) that
# survive RunPod container resets — apt-installed binaries live on the
# wipeable container disk.
PERSISTENT_BIN="/workspace/.bin"

# onnxruntime-gpu needs cuDNN 9.x at runtime. The nvidia-cudnn-cu12 wheel
# (in requirements.txt) installs the libs under site-packages/nvidia/cudnn/lib;
# expose them on LD_LIBRARY_PATH so onnxruntime can dlopen them.
CUDNN_LIB="$(ls -d "$APPLIO_DIR"/.venv/lib/python*/site-packages/nvidia/cudnn/lib 2>/dev/null | head -1)"
NV_LIBS="$(ls -d "$APPLIO_DIR"/.venv/lib/python*/site-packages/nvidia/*/lib 2>/dev/null | tr '\n' ':')"

tmux new-session -d -s "$SESSION" \
  "cd '$WORKER_DIR' && \
   PATH='$VENV_BIN:$PERSISTENT_BIN:/usr/local/bin:/usr/bin:/bin' \
   LD_LIBRARY_PATH='${NV_LIBS}${CUDNN_LIB}:/usr/local/cuda/lib64:\${LD_LIBRARY_PATH:-}' \
   WORKER_BEARER_TOKEN='$WORKER_BEARER_TOKEN' \
   APPLIO_DIR='$APPLIO_DIR' \
   '$VENV_PY' -m uvicorn worker.worker:app \
     --host 0.0.0.0 \
     --port $PORT \
     --log-level info \
     2>&1 | tee -a '$LOG_FILE'"

echo "Worker started in tmux session '$SESSION' on port $PORT"
echo "Attach:  tmux attach -t $SESSION"
echo "Logs:    tail -f $LOG_FILE"
echo "Health:  curl -s http://localhost:$PORT/health | jq ."

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

tmux new-session -d -s "$SESSION" \
  "cd '$WORKER_DIR' && \
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

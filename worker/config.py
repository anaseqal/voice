"""Centralized configuration. Reads from env vars with sane defaults."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def _env(key: str, default: str | None = None, required: bool = False) -> str:
    val = os.environ.get(key, default)
    if required and not val:
        raise RuntimeError(f"Missing required env var: {key}")
    return val or ""


# --- Auth ---
WORKER_BEARER_TOKEN = _env("WORKER_BEARER_TOKEN", required=True)

# --- Paths ---
APPLIO_DIR = Path(_env("APPLIO_DIR", "/workspace/Applio"))
APPLIO_PYTHON = Path(_env("APPLIO_PYTHON", str(APPLIO_DIR / ".venv" / "bin" / "python")))
APPLIO_LOGS = APPLIO_DIR / "logs"

WORKSPACE = Path(_env("WORKSPACE", "/workspace"))
DATASET_ROOT = WORKSPACE / "dataset"
JOBS_ROOT = WORKSPACE / "voiceapp-worker" / "jobs"
OUTPUTS_ROOT = WORKSPACE / "voiceapp-worker" / "outputs"

# UVR models used for vocal/instrumental separation.
# Pass 1 splits vocals from instrumental.
UVR_MODEL = _env("UVR_MODEL", "UVR-MDX-NET-Inst_HQ_4.onnx")
# Pass 2 (optional) cleans up residual instruments inside the vocal stem.
# Set TWO_PASS_ISOLATION=0 to disable.
UVR_CLEANUP_MODEL = _env("UVR_CLEANUP_MODEL", "5_HP-Karaoke-UVR.pth")
TWO_PASS_ISOLATION = _env("TWO_PASS_ISOLATION", "1") not in ("0", "false", "no", "")

# --- Production training defaults (locked) ---
TRAIN_SAMPLE_RATE = int(_env("TRAIN_SAMPLE_RATE", "48000"))
TRAIN_VOCODER = _env("TRAIN_VOCODER", "RefineGAN")
TRAIN_PITCH_METHOD = _env("TRAIN_PITCH_METHOD", "rmvpe")
TRAIN_EMBEDDER = _env("TRAIN_EMBEDDER", "contentvec")
TRAIN_TOTAL_EPOCHS = int(_env("TRAIN_TOTAL_EPOCHS", "500"))
TRAIN_SAVE_EVERY = int(_env("TRAIN_SAVE_EVERY", "25"))
TRAIN_SILENT_FILES = int(_env("TRAIN_SILENT_FILES", "2"))
TRAIN_CUT_PREPROCESS = _env("TRAIN_CUT_PREPROCESS", "Automatic")  # Skip | Simple | Automatic
TRAIN_TRIM_SILENCE = _env("TRAIN_TRIM_SILENCE", "1") not in ("0", "false", "no", "")
TRAIN_SILENCE_THRESHOLD_DB = int(_env("TRAIN_SILENCE_THRESHOLD_DB", "-40"))
TRAIN_SILENCE_MIN_DUR = float(_env("TRAIN_SILENCE_MIN_DUR", "0.7"))  # seconds

# --- Inference defaults (locked) ---
INFER_INDEX_RATE = float(_env("INFER_INDEX_RATE", "0.65"))
INFER_F0_METHOD = _env("INFER_F0_METHOD", "rmvpe")
INFER_PROTECT = float(_env("INFER_PROTECT", "0.33"))
INFER_VOLUME_ENVELOPE = float(_env("INFER_VOLUME_ENVELOPE", "1.0"))
INFER_HOP_LENGTH = int(_env("INFER_HOP_LENGTH", "128"))

# --- Mix defaults ---
MIX_VOCAL_GAIN = float(_env("MIX_VOCAL_GAIN", "1.3"))
MIX_INSTR_GAIN = float(_env("MIX_INSTR_GAIN", "0.9"))
MIX_LIMIT = float(_env("MIX_LIMIT", "0.95"))


def detect_vram_gb() -> int:
    """Detect the GPU's VRAM in GB. Returns 0 if no GPU."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            text=True,
            timeout=10,
        ).strip().splitlines()
        return int(out[0]) // 1024
    except Exception:
        return 0


def auto_batch_size() -> int:
    """Pick a safe batch size based on detected VRAM."""
    vram = detect_vram_gb()
    if vram >= 40:
        return 24
    if vram >= 24:
        return 16
    if vram >= 12:
        return 8
    return 4


TRAIN_BATCH_SIZE = int(_env("TRAIN_BATCH_SIZE", "0")) or auto_batch_size()


def ensure_dirs() -> None:
    for p in (DATASET_ROOT, JOBS_ROOT, OUTPUTS_ROOT):
        p.mkdir(parents=True, exist_ok=True)

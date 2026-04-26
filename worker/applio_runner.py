"""Thin subprocess wrapper around Applio's `core.py` CLI.

We shell out instead of importing because Applio mutates global state and
expects to run under its own venv with a specific torch+CUDA build."""
from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

from . import config
from .jobs import current_job

log = logging.getLogger(__name__)


class ApplioError(RuntimeError):
    pass


async def _run(cmd: list[str], cwd: Path | None = None) -> str:
    """Run a subprocess and stream output to logs. Returns combined stdout+stderr."""
    log.info("running: %s", " ".join(cmd))
    job = current_job.get()
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd) if cwd else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    chunks: list[str] = []
    assert proc.stdout is not None
    async for line in proc.stdout:
        text = line.decode("utf-8", errors="replace").rstrip()
        chunks.append(text)
        log.info("[applio] %s", text)
        if job is not None:
            job.append_log(text)
    rc = await proc.wait()
    output = "\n".join(chunks)
    if rc != 0:
        raise ApplioError(f"command failed (exit {rc}): {' '.join(cmd)}\n{output[-2000:]}")
    return output


async def preprocess(model_name: str, dataset_path: Path, sample_rate: int) -> None:
    cmd = [
        str(config.APPLIO_PYTHON),
        "core.py",
        "preprocess",
        "--model_name", model_name,
        "--dataset_path", str(dataset_path),
        "--sample_rate", str(sample_rate),
        "--cpu_cores", "4",
        "--cut_preprocess", config.TRAIN_CUT_PREPROCESS,
    ]
    await _run(cmd, cwd=config.APPLIO_DIR)


async def extract(model_name: str, sample_rate: int) -> None:
    cmd = [
        str(config.APPLIO_PYTHON),
        "core.py",
        "extract",
        "--model_name", model_name,
        "--f0_method", config.TRAIN_PITCH_METHOD,
        "--sample_rate", str(sample_rate),
        "--embedder_model", config.TRAIN_EMBEDDER,
        "--include_mutes", str(config.TRAIN_SILENT_FILES),
        "--gpu", "0",
        "--cpu_cores", "4",
    ]
    await _run(cmd, cwd=config.APPLIO_DIR)


async def train(model_name: str, sample_rate: int, batch_size: int,
                total_epoch: int, save_every: int, vocoder: str) -> None:
    cmd = [
        str(config.APPLIO_PYTHON),
        "core.py",
        "train",
        "--model_name", model_name,
        "--sample_rate", str(sample_rate),
        "--batch_size", str(batch_size),
        "--total_epoch", str(total_epoch),
        "--save_every_epoch", str(save_every),
        "--save_every_weights", "True",
        "--vocoder", vocoder,
        "--gpu", "0",
        "--pretrained", "True",
    ]
    await _run(cmd, cwd=config.APPLIO_DIR)


async def index(model_name: str) -> None:
    cmd = [
        str(config.APPLIO_PYTHON),
        "core.py",
        "index",
        "--model_name", model_name,
        "--index_algorithm", "Auto",
    ]
    await _run(cmd, cwd=config.APPLIO_DIR)


async def infer(
    pth_path: Path,
    index_path: Path,
    input_path: Path,
    output_path: Path,
    pitch: int = 0,
) -> None:
    cmd = [
        str(config.APPLIO_PYTHON),
        "core.py",
        "infer",
        "--pth_path", str(pth_path),
        "--index_path", str(index_path),
        "--input_path", str(input_path),
        "--output_path", str(output_path),
        "--pitch", str(pitch),
        "--index_rate", str(config.INFER_INDEX_RATE),
        "--volume_envelope", str(config.INFER_VOLUME_ENVELOPE),
        "--protect", str(config.INFER_PROTECT),
        "--hop_length", str(config.INFER_HOP_LENGTH),
        "--f0_method", config.INFER_F0_METHOD,
        "--embedder_model", config.TRAIN_EMBEDDER,
        "--export_format", "WAV",
    ]
    await _run(cmd, cwd=config.APPLIO_DIR)


def find_best_checkpoint(model_name: str) -> tuple[Path, Path]:
    """Return (pth_path, index_path) for the highest-epoch checkpoint."""
    log_dir = config.APPLIO_LOGS / model_name
    if not log_dir.exists():
        raise ApplioError(f"no log dir: {log_dir}")

    candidates = sorted(
        log_dir.glob(f"{model_name}_*e_*s.pth"),
        key=lambda p: int(p.stem.split("_")[1].rstrip("e")),
    )
    if not candidates:
        raise ApplioError(f"no checkpoints found in {log_dir}")
    pth = candidates[-1]

    index_files = list(log_dir.glob(f"{model_name}*.index"))
    if not index_files:
        raise ApplioError(f"no index file in {log_dir}")
    return pth, index_files[0]


def list_checkpoints(model_name: str) -> list[tuple[int, Path]]:
    """Return all saved checkpoints sorted by epoch number."""
    log_dir = config.APPLIO_LOGS / model_name
    if not log_dir.exists():
        return []
    out: list[tuple[int, Path]] = []
    for p in log_dir.glob(f"{model_name}_*e_*s.pth"):
        try:
            epoch = int(p.stem.split("_")[1].rstrip("e"))
            out.append((epoch, p))
        except (ValueError, IndexError):
            continue
    return sorted(out, key=lambda x: x[0])


def cleanup_model_logs(model_name: str) -> None:
    """Remove a model's training artifacts."""
    log_dir = config.APPLIO_LOGS / model_name
    if log_dir.exists():
        shutil.rmtree(log_dir)

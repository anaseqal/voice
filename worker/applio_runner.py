"""Thin subprocess wrapper around Applio's `core.py` CLI.

We shell out instead of importing because Applio mutates global state and
expects to run under its own venv with a specific torch+CUDA build."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
from pathlib import Path

from . import config
from .jobs import current_job

log = logging.getLogger(__name__)

# Applio prints `lowest_value=22.071 (epoch 138 and step 1654)` per epoch.
# We capture the final occurrence to know which epoch had the lowest loss.
_LOSS_PATTERN = re.compile(r"lowest_value=([\d.]+)\s*\(epoch\s+(\d+)\s+and\s+step\s+(\d+)\)")
_BEST_EPOCH_FILENAME = "best_epoch.json"


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
    output = await _run(cmd, cwd=config.APPLIO_DIR)

    # Persist the best (lowest-loss) epoch so find_best_checkpoint can prefer
    # it over the highest-epoch checkpoint. Writing this even if training
    # ended early — Applio prints the running best after every epoch.
    matches = _LOSS_PATTERN.findall(output)
    if matches:
        loss, epoch, step = matches[-1]
        best = {"loss": float(loss), "epoch": int(epoch), "step": int(step)}
        try:
            log_dir = config.APPLIO_LOGS / model_name
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / _BEST_EPOCH_FILENAME).write_text(json.dumps(best))
            log.info("recorded best epoch for %s: %s", model_name, best)
        except Exception as exc:
            log.warning("failed to persist best epoch: %s", exc)


def read_best_epoch(model_name: str) -> dict | None:
    """Return {'loss', 'epoch', 'step'} parsed during training, or None."""
    path = config.APPLIO_LOGS / model_name / _BEST_EPOCH_FILENAME
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


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
    # Note: --hop_length was removed from Applio's infer CLI. Don't pass it.
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
        "--f0_method", config.INFER_F0_METHOD,
        "--embedder_model", config.TRAIN_EMBEDDER,
        "--export_format", "WAV",
    ]
    await _run(cmd, cwd=config.APPLIO_DIR)


def find_best_checkpoint(model_name: str) -> tuple[Path, Path]:
    """Return (pth_path, index_path) for the best checkpoint we can identify.

    Preference order:
      1. The saved checkpoint closest to the lowest-loss epoch (recorded in
         best_epoch.json during training). RVC loss curves often plateau or
         re-rise after the true minimum, so the highest-epoch save isn't
         necessarily the best-performing model.
      2. Highest-epoch checkpoint as a fallback (e.g. for older models
         trained before this tracking existed)."""
    log_dir = config.APPLIO_LOGS / model_name
    if not log_dir.exists():
        raise ApplioError(f"no log dir: {log_dir}")

    candidates = list_checkpoints(model_name)
    if not candidates:
        raise ApplioError(f"no checkpoints found in {log_dir}")

    best = read_best_epoch(model_name)
    if best is not None and "epoch" in best:
        target = int(best["epoch"])
        # save_every_epoch means the actual saved file is the closest one to
        # `target`. Closest absolute distance, with ties broken by later epoch.
        chosen_epoch, pth = min(
            candidates,
            key=lambda c: (abs(c[0] - target), -c[0]),
        )
        log.info(
            "best checkpoint for %s: epoch %d (target=%d, loss=%s)",
            model_name, chosen_epoch, target, best.get("loss"),
        )
    else:
        chosen_epoch, pth = candidates[-1]
        log.info(
            "no best_epoch.json for %s; falling back to highest epoch %d",
            model_name, chosen_epoch,
        )

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

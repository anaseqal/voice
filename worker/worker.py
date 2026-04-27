"""FastAPI worker that runs on the RunPod GPU pod.

Endpoints:
    POST /train          start a training job
    POST /cover          start a cover job
    GET  /jobs/{id}      get job status
    GET  /jobs/{id}/output  download cover output (auth required)
    GET  /models         list models present on disk
    DELETE /models/{slug}  delete a model
    GET  /health         GPU + storage status
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import httpx

from . import applio_runner, config, pipeline
from .auth import require_token
from .jobs import JobStatus, JobType, queue, registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
log = logging.getLogger("worker")

config.ensure_dirs()

app = FastAPI(title="voice-worker", version="0.1.0")


@app.on_event("startup")
async def _startup() -> None:
    queue.start()
    # Tell the web app to sweep any in-flight DB rows whose workerJobId we
    # don't recognize. On a fresh worker process the registry is empty, so
    # the web flips every status=running/queued ghost to failed.
    if config.WEB_BASE_URL and config.CALLBACK_BEARER_TOKEN:
        url = f"{config.WEB_BASE_URL.rstrip('/')}/api/admin/sweep-stale"
        live_ids = [j.id for j in registry.list()]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {config.CALLBACK_BEARER_TOKEN}"},
                    json={"worker_job_ids": live_ids},
                )
                if resp.status_code == 200:
                    log.info("startup sweep: %s", resp.json())
                else:
                    log.warning("startup sweep got %s: %s",
                                resp.status_code, resp.text[:200])
        except Exception as exc:
            log.warning("startup sweep failed (non-fatal): %s", exc)
    else:
        log.info("startup sweep skipped (WEB_BASE_URL or CALLBACK_BEARER_TOKEN unset)")


# --- Schemas --------------------------------------------------------------

class TrainSettings(BaseModel):
    sample_rate: int | None = None
    vocoder: str | None = None
    total_epoch: int | None = None
    save_every: int | None = None
    batch_size: int | None = None
    # Advanced overrides — null means "use worker default".
    two_pass_isolation: bool | None = None
    trim_silence: bool | None = None
    cut_preprocess: str | None = None  # Skip | Simple | Automatic


class TrainRequest(BaseModel):
    slug: str = Field(..., pattern=r"^[a-z0-9][a-z0-9_-]{1,40}$")
    song_urls: list[str] = Field(..., min_length=1, max_length=100)
    callback_url: str | None = None
    callback_token: str | None = None
    settings: TrainSettings = Field(default_factory=TrainSettings)
    # If true, keep any existing files under dataset/<slug>/ and skip
    # re-downloading songs that are already on disk. Used by the web app's
    # retry flow so a failed run doesn't pay the download cost twice.
    reuse_existing: bool = False


class CoverSettings(BaseModel):
    pitch: int = 0
    epoch: int | None = None  # specific checkpoint epoch; default = best
    # Advanced inference overrides — null means "use worker default".
    index_rate: float | None = None     # 0..1, default 0.65
    protect: float | None = None        # 0..0.5, default 0.33
    volume_envelope: float | None = None  # 0..1, default 1.0
    # Treat the input as already-isolated vocals: skip both isolation passes
    # and the final mix-with-instrumental. Output is the converted vocal only.
    skip_isolation: bool = False


class CoverRequest(BaseModel):
    model_slug: str = Field(..., pattern=r"^[a-z0-9][a-z0-9_-]{1,40}$")
    audio_url: str
    callback_url: str | None = None
    callback_token: str | None = None
    settings: CoverSettings = Field(default_factory=CoverSettings)


# --- Routes ---------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    vram = config.detect_vram_gb()
    try:
        gpu_name = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            text=True, timeout=5,
        ).strip().splitlines()[0]
    except Exception:
        gpu_name = "unknown"

    disk = shutil.disk_usage(config.WORKSPACE)
    return {
        "status": "ok",
        "gpu": {
            "name": gpu_name,
            "vram_gb": vram,
            "auto_batch_size": config.auto_batch_size(),
        },
        "disk": {
            "total_gb": disk.total // (1024**3),
            "free_gb": disk.free // (1024**3),
            "used_pct": round(100 * disk.used / disk.total, 1),
        },
        "applio_dir": str(config.APPLIO_DIR),
        "applio_present": config.APPLIO_DIR.exists(),
        "active_jobs": sum(
            1 for j in registry.list()
            if j.status in (JobStatus.QUEUED, JobStatus.RUNNING)
        ),
        "queue": queue.status(),
    }


@app.post("/train", dependencies=[Depends(require_token)])
async def start_training(req: TrainRequest) -> dict:
    job = registry.create(
        type=JobType.TRAIN,
        payload={
            "slug": req.slug,
            "song_urls": req.song_urls,
            "settings": req.settings.model_dump(exclude_none=True),
            "reuse_existing": req.reuse_existing,
        },
        callback_url=req.callback_url,
        callback_token=req.callback_token,
    )
    position = queue.submit(job, pipeline.run_training)
    log.info("train job %s queued for slug=%s songs=%d (position=%d)",
             job.id, req.slug, len(req.song_urls), position)
    return {"job_id": job.id, "status": job.status.value, "queue_position": position}


@app.post("/cover", dependencies=[Depends(require_token)])
async def start_cover(req: CoverRequest) -> dict:
    # Verify model exists
    log_dir = config.APPLIO_LOGS / req.model_slug
    if not log_dir.exists() or not applio_runner.list_checkpoints(req.model_slug):
        raise HTTPException(status_code=404, detail=f"model '{req.model_slug}' not found")

    job = registry.create(
        type=JobType.COVER,
        payload={
            "model_slug": req.model_slug,
            "audio_url": req.audio_url,
            "settings": req.settings.model_dump(exclude_none=True),
        },
        callback_url=req.callback_url,
        callback_token=req.callback_token,
    )
    position = queue.submit(job, pipeline.run_cover)
    log.info("cover job %s queued for model=%s (position=%d)",
             job.id, req.model_slug, position)
    return {"job_id": job.id, "status": job.status.value, "queue_position": position}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_token)])
async def get_job(job_id: str) -> dict:
    job = registry.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job.to_dict()


@app.get("/jobs/{job_id}/output", dependencies=[Depends(require_token)])
async def get_job_output(job_id: str) -> FileResponse:
    job = registry.get(job_id)
    if not job:
        # File may still exist on disk even if registry was cleared
        path = config.OUTPUTS_ROOT / f"{job_id}.wav"
        if path.exists():
            return FileResponse(path, media_type="audio/wav",
                                filename=f"{job_id}.wav")
        raise HTTPException(status_code=404, detail="job not found")

    if job.status != JobStatus.DONE:
        raise HTTPException(status_code=409, detail=f"job not done (status={job.status.value})")

    path = Path(job.result.get("output_path", ""))
    if not path.exists():
        raise HTTPException(status_code=410, detail="output file no longer exists")
    return FileResponse(path, media_type="audio/wav", filename=f"{job_id}.wav")


@app.get("/models", dependencies=[Depends(require_token)])
async def list_models() -> dict:
    out = []
    if config.APPLIO_LOGS.exists():
        for d in sorted(config.APPLIO_LOGS.iterdir()):
            if not d.is_dir():
                continue
            ckpts = applio_runner.list_checkpoints(d.name)
            if not ckpts:
                continue
            idx_files = list(d.glob(f"{d.name}*.index"))
            out.append({
                "slug": d.name,
                "checkpoints": [{"epoch": e, "path": str(p)} for e, p in ckpts],
                "best_epoch": ckpts[-1][0],
                "index_file": str(idx_files[0]) if idx_files else None,
            })
    return {"models": out}


@app.delete("/models/{slug}", dependencies=[Depends(require_token)])
async def delete_model(slug: str) -> dict:
    log_dir = config.APPLIO_LOGS / slug
    dataset_dir = config.DATASET_ROOT / slug
    deleted = []
    for p in (log_dir, dataset_dir):
        if p.exists():
            shutil.rmtree(p)
            deleted.append(str(p))
    return {"deleted": deleted}


@app.get("/")
async def root() -> dict:
    return {"service": "voice-worker", "version": app.version}

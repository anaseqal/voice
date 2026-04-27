"""Orchestrates the full train and cover pipelines."""
from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path
from urllib.parse import urlparse

import httpx

from . import applio_runner, config
from .jobs import Job, JobStatus, current_job

LOG_FLUSH_INTERVAL_SEC = 2.0

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)
DIRECT_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".opus", ".aac"}

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _set(job: Job, *, stage: str | None = None, progress: int | None = None,
               message: str | None = None) -> None:
    if stage is not None:
        job.stage = stage
    if progress is not None:
        job.progress = max(0, min(100, progress))
    if message is not None:
        job.message = message
    await _callback(job)


async def _callback(job: Job, *, terminal: bool = False) -> None:
    if not job.callback_url:
        return
    payload = job.to_dict()
    headers = {}
    if job.callback_token:
        headers["Authorization"] = f"Bearer {job.callback_token}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await client.post(job.callback_url, json=payload, headers=headers)
    except Exception as exc:
        log.warning("callback to %s failed: %s", job.callback_url, exc)
        if terminal:
            # one retry for terminal events so we don't lose final state
            await asyncio.sleep(5)
            try:
                async with httpx.AsyncClient(timeout=20) as client:
                    await client.post(job.callback_url, json=payload, headers=headers)
            except Exception as exc2:
                log.error("terminal callback retry failed: %s", exc2)


async def _run_cmd(cmd: list[str]) -> None:
    job = current_job.get()
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    assert proc.stdout is not None
    async for raw in proc.stdout:
        text = raw.decode("utf-8", errors="replace").rstrip()
        log.info("[cmd] %s", text)
        if job is not None:
            job.append_log(text)
    rc = await proc.wait()
    if rc != 0:
        raise RuntimeError(f"command failed (rc={rc}): {' '.join(cmd)}")


async def _log_flusher(job: Job) -> None:
    """Fire a callback whenever log_tail changes, throttled to LOG_FLUSH_INTERVAL_SEC.

    Lets the frontend show fresh subprocess output without spamming a callback
    per line. Cancelled by the caller when the job ends."""
    last_seq = job.log_seq
    while True:
        try:
            await asyncio.sleep(LOG_FLUSH_INTERVAL_SEC)
            if job.log_seq != last_seq:
                last_seq = job.log_seq
                await _callback(job)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            log.warning("log flusher error: %s", exc)


# ---------------------------------------------------------------------------
# Separator cache (audio-separator in-process API)
#
# Keeping Separator instances alive across songs+passes avoids paying ~50s of
# Python+torch+onnx startup and model load on every isolation. Models stay
# pinned in VRAM (a few hundred MB each) for the lifetime of the worker.
# ---------------------------------------------------------------------------

_separator_cache: dict[str, "Separator"] = {}  # type: ignore[name-defined]  # noqa: F821
_separator_lock = asyncio.Lock()
_log_handler_attached = False


class _JobLogHandler(logging.Handler):
    """Forward audio_separator log records into the active job's log_tail."""

    def emit(self, record: logging.LogRecord) -> None:
        job = current_job.get()
        if job is None:
            return
        try:
            job.append_log(self.format(record))
        except Exception:  # never let logging break the pipeline
            pass


def _attach_log_handler() -> None:
    global _log_handler_attached
    if _log_handler_attached:
        return
    handler = _JobLogHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(name)s - %(message)s"))
    logging.getLogger("audio_separator").addHandler(handler)
    _log_handler_attached = True


async def _get_separator(
    model_filename: str,
    output_dir: Path,
    output_single_stem: str | None,
):  # type: ignore[no-untyped-def]
    """Lock-protected init. Caller must already hold _separator_lock.

    With SEPARATOR_CACHE=1 we reuse a single instance per model across calls
    (fast, but bitten us before — see config.SEPARATOR_CACHE). With cache off
    we construct a fresh Separator each call and let load_model run, paying
    ~5-30s per call but guaranteeing clean state."""
    from audio_separator.separator import Separator  # heavy import
    _attach_log_handler()

    if config.SEPARATOR_CACHE and model_filename in _separator_cache:
        sep = _separator_cache[model_filename]
        sep.output_dir = str(output_dir)
        sep.output_single_stem = output_single_stem
        return sep

    sep = Separator(
        log_level=logging.INFO,
        model_file_dir="/tmp/audio-separator-models/",
        output_format="WAV",
        output_dir=str(output_dir),
        output_single_stem=output_single_stem,
    )
    log.info(
        "constructing Separator for %s (cache=%s, out=%s, single=%s)",
        model_filename, config.SEPARATOR_CACHE, output_dir, output_single_stem,
    )
    await asyncio.to_thread(sep.load_model, model_filename=model_filename)
    if config.SEPARATOR_CACHE:
        _separator_cache[model_filename] = sep
    return sep


# ---------------------------------------------------------------------------
# Audio operations
# ---------------------------------------------------------------------------

async def _download_direct(url: str, dest_dir: Path, basename: str) -> Path:
    """Stream a direct audio file URL to disk."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower() or ".mp3"
    if ext not in DIRECT_AUDIO_EXTS:
        ext = ".mp3"
    dest = dest_dir / f"{basename}{ext}"
    headers = {
        "User-Agent": USER_AGENT,
        "Referer": f"{parsed.scheme}://{parsed.netloc}/",
        "Accept": "*/*",
    }
    log.info("direct download: %s → %s", url, dest)
    async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
        async with client.stream("GET", url, headers=headers) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as fh:
                async for chunk in resp.aiter_bytes(64 * 1024):
                    fh.write(chunk)
    return dest


async def _download_via_ytdlp(url: str, dest_dir: Path, basename: str) -> Path:
    """Use yt-dlp for YouTube/Soundcloud/etc. extracts to MP3."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(dest_dir / f"{basename}.%(ext)s")
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--user-agent", USER_AGENT,
        "-o", out_template,
        url,
    ]
    await _run_cmd(cmd)
    files = sorted(dest_dir.glob(f"{basename}.*"))
    audio_files = [f for f in files if f.suffix.lower() in DIRECT_AUDIO_EXTS]
    if not audio_files:
        raise RuntimeError(f"yt-dlp produced no audio file for {url}")
    return audio_files[0]


def _looks_like_direct_audio(url: str) -> bool:
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    return ext in DIRECT_AUDIO_EXTS


async def download_audio(url: str, dest_dir: Path, basename: str) -> Path:
    """Download audio. Direct file URLs use HTTP fetch; everything else
    (YouTube, Soundcloud, ...) goes through yt-dlp. If the direct fetch
    fails for some reason (403, redirect to HTML, ...) we fall back to
    yt-dlp's generic extractor as a last resort."""
    if _looks_like_direct_audio(url):
        try:
            return await _download_direct(url, dest_dir, basename)
        except Exception as exc:
            log.warning("direct download failed (%s) — falling back to yt-dlp", exc)
    return await _download_via_ytdlp(url, dest_dir, basename)


async def _separate_once(
    input_path: Path,
    output_dir: Path,
    model_filename: str,
    both_stems: bool,
) -> dict[str, Path]:
    """Run one separation pass via the cached in-process Separator.

    First call per model loads it (~5-30s). Subsequent calls reuse the loaded
    model — pure GPU work. Serialized by _separator_lock so concurrent jobs
    don't trample each other's output_dir/output_single_stem state.

    Trust the list of paths returned by separate() rather than globbing —
    audio-separator's internal model snapshots output_dir at load_model time,
    so mutating sep.output_dir between calls may write to the wrong directory.
    We move files into output_dir if needed."""
    output_dir.mkdir(parents=True, exist_ok=True)

    async with _separator_lock:
        sep = await _get_separator(
            model_filename,
            output_dir,
            None if both_stems else "Vocals",
        )
        returned = await asyncio.to_thread(sep.separate, str(input_path))

    log.info("separator returned for %s: %s", input_path.name, returned)

    # Resolve each returned filename to an existing file. If the separator
    # wrote it somewhere other than output_dir (because of the mutation issue
    # above), find it and move it.
    candidate_dirs = [output_dir]
    sep_dir = getattr(sep, "output_dir", None)
    if sep_dir and Path(sep_dir) not in candidate_dirs:
        candidate_dirs.append(Path(sep_dir))
    candidate_dirs.append(config.APPLIO_DIR)  # fallback: cwd of train subprocess

    resolved: list[Path] = []
    for fname in returned or []:
        p = Path(fname)
        if p.is_absolute() and p.exists():
            resolved.append(p)
            continue
        found = False
        for base in candidate_dirs:
            cand = base / Path(fname).name
            if cand.exists():
                resolved.append(cand)
                found = True
                break
        if not found:
            log.warning("separator-returned file not found anywhere: %s", fname)

    # Move any file outside output_dir into it
    final: list[Path] = []
    for p in resolved:
        if p.parent.resolve() != output_dir.resolve():
            dest = output_dir / p.name
            shutil.move(str(p), dest)
            final.append(dest)
        else:
            final.append(p)

    # Classify stems by filename substring (case-insensitive).
    result: dict[str, Path] = {}
    for p in final:
        n = p.name.lower()
        if "vocals" in n and "vocals" not in result:
            result["vocals"] = p
        elif "instrumental" in n and "instrumental" not in result:
            result["instrumental"] = p

    # Fallbacks for naming variations between audio-separator versions.
    if not both_stems and "vocals" not in result and final:
        # Single-stem mode: only one file expected, treat it as vocals.
        result["vocals"] = final[0]
    elif both_stems and final:
        # Two-stem mode: audio-separator returns files in a deterministic
        # order (Vocals first, Instrumental second). If our substring classifier
        # missed one, fall back to that ordering rather than failing the job.
        if "vocals" not in result:
            for p in final:
                if p not in result.values():
                    result["vocals"] = p
                    log.warning("vocals classified by file order: %s", p.name)
                    break
        if "instrumental" not in result:
            for p in final:
                if p not in result.values():
                    result["instrumental"] = p
                    log.warning("instrumental classified by file order: %s", p.name)
                    break

    return result


async def isolate(input_path: Path, output_dir: Path, both_stems: bool = False) -> dict[str, Path]:
    """Isolate vocals from a song.

    Pass 1: split vocals from instrumental using `UVR_MODEL`.
    Pass 2 (if `TWO_PASS_ISOLATION` is on): re-run a karaoke-style cleanup
    model on the vocal stem to strip residual instruments (cymbals, harmonies,
    reverb tails). The pass-2 instrumental output is discarded — only the
    cleaner vocals are kept. The pass-1 instrumental is preserved unchanged
    (we want the *full* original backing track for cover mixing).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Pass 1: main separation
    pass1_dir = output_dir / "_pass1"
    pass1 = await _separate_once(
        input_path,
        pass1_dir,
        model_filename=config.UVR_MODEL,
        both_stems=both_stems,
    )
    if "vocals" not in pass1:
        raise RuntimeError(f"pass-1 isolation produced no vocals for {input_path}")

    final: dict[str, Path] = {}

    # Persist pass-1 instrumental as-is (don't touch — used for remix)
    if both_stems and "instrumental" in pass1:
        instr_dest = output_dir / f"{input_path.stem}_(Instrumental)_pass1.wav"
        shutil.move(str(pass1["instrumental"]), instr_dest)
        final["instrumental"] = instr_dest

    if not config.TWO_PASS_ISOLATION:
        # Move vocals up and clean
        vocals_dest = output_dir / f"{input_path.stem}_(Vocals).wav"
        shutil.move(str(pass1["vocals"]), vocals_dest)
        final["vocals"] = vocals_dest
        shutil.rmtree(pass1_dir, ignore_errors=True)
        return final

    # Pass 2: clean up the vocal stem
    pass2_dir = output_dir / "_pass2"
    pass2 = await _separate_once(
        pass1["vocals"],
        pass2_dir,
        model_filename=config.UVR_CLEANUP_MODEL,
        both_stems=False,  # we only need the cleaned vocals from pass 2
    )
    if "vocals" not in pass2:
        log.warning("pass-2 cleanup yielded no vocals; falling back to pass-1 vocals")
        clean_vocals_src = pass1["vocals"]
    else:
        clean_vocals_src = pass2["vocals"]

    vocals_dest = output_dir / f"{input_path.stem}_(Vocals).wav"
    shutil.move(str(clean_vocals_src), vocals_dest)
    final["vocals"] = vocals_dest

    # Cleanup intermediates
    shutil.rmtree(pass1_dir, ignore_errors=True)
    shutil.rmtree(pass2_dir, ignore_errors=True)
    return final


def _auto_total_epoch(num_songs: int) -> int:
    """Pick a reasonable epoch count from dataset size.

    More songs = more diverse data per pass, so the model converges in fewer
    epochs. Tiny datasets need to keep cycling to learn anything; large ones
    overfit if you grind for 500 epochs. Tuned against RVC community defaults."""
    if num_songs <= 3:
        return 500
    if num_songs <= 8:
        return 350
    if num_songs <= 15:
        return 250
    if num_songs <= 25:
        return 200
    return 150


def _resolve_total_epoch(settings: dict, num_songs: int) -> int:
    """Explicit settings override > env override > auto from song count."""
    override = settings.get("total_epoch")
    if override is not None:
        return int(override)
    cfg = config.TRAIN_TOTAL_EPOCHS
    if isinstance(cfg, str) and cfg.lower() == "auto":
        return _auto_total_epoch(num_songs)
    return int(cfg)


async def _trim_silence(path: Path) -> None:
    """In-place: rewrite a vocal WAV with long silent gaps removed.

    Used on training data only — we want to feed the model singing, not
    instrumental gaps and outros (which waste pitch/embed/train cycles
    and slightly poison the model with thousands of 'silence' samples).

    Cover paths skip this — there we need to keep the vocal in sync with
    the original instrumental for the final mix.

    Falls back to the original file if the filter strips too much (e.g.
    threshold mismatched to a quiet track), so the pipeline never ends
    up with an empty vocal."""
    if not config.TRAIN_TRIM_SILENCE:
        return
    tmp = path.with_suffix(".trimmed.wav")
    db = config.TRAIN_SILENCE_THRESHOLD_DB
    dur = config.TRAIN_SILENCE_MIN_DUR
    silenceremove = (
        f"silenceremove="
        f"start_periods=1:start_duration=0:start_threshold={db}dB:"
        f"stop_periods=-1:stop_duration={dur}:stop_threshold={db}dB:"
        f"stop_silence=0.1"
    )
    cmd = [
        "ffmpeg", "-y", "-i", str(path),
        "-af", silenceremove,
        "-ar", "44100",
        "-c:a", "pcm_s16le",
        str(tmp),
    ]
    try:
        await _run_cmd(cmd)
    except RuntimeError as exc:
        log.warning("silence trim failed for %s: %s; keeping original", path.name, exc)
        if tmp.exists():
            tmp.unlink()
        return

    orig_dur = _audio_duration(path)
    new_dur = _audio_duration(tmp)
    if new_dur < 5.0 or (orig_dur > 0 and new_dur < orig_dur * 0.2):
        log.warning(
            "silence trim too aggressive on %s (%.1fs → %.1fs); keeping original",
            path.name, orig_dur, new_dur,
        )
        tmp.unlink()
        return
    tmp.replace(path)
    log.info("silence trim: %s %.1fs → %.1fs", path.name, orig_dur, new_dur)


async def mix(vocal_path: Path, instrumental_path: Path, output_path: Path) -> None:
    """Mix converted vocal with original instrumental."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    filter_complex = (
        f"[0:a]volume={config.MIX_INSTR_GAIN}[i];"
        f"[1:a]volume={config.MIX_VOCAL_GAIN}[v];"
        f"[i][v]amix=inputs=2:duration=longest:normalize=0,"
        f"alimiter=limit={config.MIX_LIMIT}"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", str(instrumental_path),
        "-i", str(vocal_path),
        "-filter_complex", filter_complex,
        "-ar", "44100",
        "-c:a", "pcm_s16le",
        str(output_path),
    ]
    await _run_cmd(cmd)


# ---------------------------------------------------------------------------
# Training pipeline
# ---------------------------------------------------------------------------

async def run_training(job: Job) -> None:
    current_job.set(job)
    flusher = asyncio.create_task(_log_flusher(job))
    job.status = JobStatus.RUNNING
    import time
    job.started_at = time.time()

    slug: str = job.payload["slug"]
    song_urls: list[str] = job.payload["song_urls"]
    settings: dict = job.payload.get("settings", {})

    sample_rate = int(settings.get("sample_rate", config.TRAIN_SAMPLE_RATE))
    vocoder = settings.get("vocoder", config.TRAIN_VOCODER)
    save_every = int(settings.get("save_every", config.TRAIN_SAVE_EVERY))
    batch_size = int(settings.get("batch_size", config.TRAIN_BATCH_SIZE))
    # total_epoch is resolved after the download loop so it can scale with
    # the number of songs that actually downloaded successfully.

    dataset_dir = config.DATASET_ROOT / slug
    raw_dir = dataset_dir / "raw"
    vocals_dir = dataset_dir / "vocals"
    reuse = bool(job.payload.get("reuse_existing"))

    # Wipe prior dataset unless we're explicitly reusing files (retry flow).
    if dataset_dir.exists() and not reuse:
        shutil.rmtree(dataset_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    vocals_dir.mkdir(parents=True, exist_ok=True)
    # On retry, wipe stale isolation output so we re-isolate from raw/.
    if reuse:
        for child in vocals_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)

    try:
        # 1. Download (skip if file already exists when reuse_existing is set)
        await _set(job, stage="downloading", progress=0,
                   message=f"downloading 0/{len(song_urls)}")
        downloaded: list[Path] = []
        for i, url in enumerate(song_urls, 1):
            basename = f"song_{i:02d}"
            if reuse:
                cached = next(
                    (p for p in raw_dir.glob(f"{basename}.*")
                     if p.suffix.lower() in DIRECT_AUDIO_EXTS),
                    None,
                )
                if cached is not None:
                    log.info("reuse: %s already on disk, skipping download", cached.name)
                    downloaded.append(cached)
                    pct = int(15 * i / len(song_urls))
                    await _set(job, progress=pct,
                               message=f"reused {i}/{len(song_urls)}")
                    continue
            try:
                path = await download_audio(url, raw_dir, basename)
                downloaded.append(path)
                pct = int(15 * i / len(song_urls))
                await _set(job, progress=pct,
                           message=f"downloaded {i}/{len(song_urls)}")
            except Exception as exc:
                log.warning("download failed for %s: %s", url, exc)
        if not downloaded:
            raise RuntimeError("no songs were downloaded successfully")

        # 2. Isolate vocals (then trim silence so we don't train on outros/gaps)
        await _set(job, stage="isolating", progress=15,
                   message=f"isolating 0/{len(downloaded)}")
        isolated: list[Path] = []
        skipped: list[tuple[Path, str]] = []
        for i, song in enumerate(downloaded, 1):
            try:
                stems = await isolate(song, vocals_dir, both_stems=False)
                if "vocals" not in stems:
                    raise RuntimeError("separator returned no vocals stem")
                await _trim_silence(stems["vocals"])
                isolated.append(stems["vocals"])
            except Exception as exc:
                log.warning("isolation failed for %s: %s; skipping", song.name, exc)
                skipped.append((song, str(exc)))
            pct = 15 + int(20 * i / len(downloaded))
            msg = f"isolated {len(isolated)}/{len(downloaded)}"
            if skipped:
                msg += f" ({len(skipped)} skipped)"
            await _set(job, progress=pct, message=msg)

        if not isolated:
            raise RuntimeError(
                f"all {len(downloaded)} songs failed isolation; "
                f"first error: {skipped[0][1] if skipped else 'unknown'}"
            )
        if skipped:
            log.warning("%d/%d songs skipped during isolation", len(skipped), len(downloaded))

        total_epoch = _resolve_total_epoch(settings, len(isolated))
        log.info(
            "training plan: %d songs (of %d submitted) → %d epochs (override=%s)",
            len(isolated), len(song_urls), total_epoch, settings.get("total_epoch"),
        )

        # 3. Preprocess
        await _set(job, stage="preprocessing", progress=35,
                   message="preprocessing dataset")
        await applio_runner.preprocess(slug, vocals_dir, sample_rate)

        # 4. Extract features
        await _set(job, stage="extracting", progress=45,
                   message="extracting features")
        await applio_runner.extract(slug, sample_rate)

        # 5. Train (with progress watcher)
        await _set(job, stage="training", progress=50,
                   message=f"training 0/{total_epoch} epochs")
        watcher = asyncio.create_task(_watch_training_progress(job, slug, total_epoch))
        try:
            await applio_runner.train(slug, sample_rate, batch_size,
                                      total_epoch, save_every, vocoder)
        finally:
            watcher.cancel()

        # 6. Index
        await _set(job, stage="indexing", progress=95, message="building index")
        await applio_runner.index(slug)

        # 7. Done
        pth, idx = applio_runner.find_best_checkpoint(slug)
        best_info = applio_runner.read_best_epoch(slug)
        # The .pth filename is <slug>_<epoch>e_<step>s.pth — pull the actual
        # epoch we chose so the web app records the right one.
        chosen_epoch: int | None = None
        try:
            chosen_epoch = int(pth.stem.split("_")[1].rstrip("e"))
        except (ValueError, IndexError):
            pass
        job.result = {
            "model_pth": str(pth),
            "index_file": str(idx),
            "best_epoch": chosen_epoch,
            "best_loss": best_info.get("loss") if best_info else None,
            "checkpoints": [
                {"epoch": e, "path": str(p)}
                for e, p in applio_runner.list_checkpoints(slug)
            ],
            "songs_used": len(downloaded),
        }
        job.status = JobStatus.DONE
        await _set(job, stage="ready", progress=100, message="model ready")
    except Exception as exc:
        log.exception("training job %s failed", job.id)
        job.status = JobStatus.FAILED
        job.error = str(exc)
        await _set(job, stage="failed", message=str(exc))
    finally:
        flusher.cancel()
        import time as _t
        job.finished_at = _t.time()
        await _callback(job, terminal=True)


async def _watch_training_progress(job: Job, slug: str, total_epoch: int) -> None:
    """Poll the log dir for new checkpoint files; report progress."""
    last_seen = -1
    while True:
        try:
            await asyncio.sleep(20)
            ckpts = applio_runner.list_checkpoints(slug)
            if not ckpts:
                continue
            current = ckpts[-1][0]
            if current > last_seen:
                last_seen = current
                pct = 50 + int(45 * current / total_epoch)
                await _set(job, progress=pct,
                           message=f"epoch {current}/{total_epoch}")
        except asyncio.CancelledError:
            return
        except Exception as exc:
            log.warning("progress watcher error: %s", exc)


# ---------------------------------------------------------------------------
# Cover pipeline
# ---------------------------------------------------------------------------

async def run_cover(job: Job) -> None:
    current_job.set(job)
    flusher = asyncio.create_task(_log_flusher(job))
    job.status = JobStatus.RUNNING
    import time
    job.started_at = time.time()

    model_slug: str = job.payload["model_slug"]
    audio_url: str = job.payload["audio_url"]
    settings: dict = job.payload.get("settings", {})
    pitch: int = int(settings.get("pitch", 0))
    epoch: int | None = settings.get("epoch")  # optional, pick a specific checkpoint

    job_dir = config.JOBS_ROOT / job.id
    job_dir.mkdir(parents=True, exist_ok=True)
    output_path = config.OUTPUTS_ROOT / f"{job.id}.wav"

    try:
        # 1. Download
        await _set(job, stage="downloading", progress=5, message="fetching audio")
        input_audio = await download_audio(audio_url, job_dir, "input")

        # 2. Isolate (both stems)
        await _set(job, stage="isolating", progress=20, message="separating vocals")
        stems = await isolate(input_audio, job_dir, both_stems=True)
        vocals_in = stems["vocals"]
        instrumental = stems["instrumental"]

        # 3. Find checkpoint
        if epoch is not None:
            ckpts = {e: p for e, p in applio_runner.list_checkpoints(model_slug)}
            if epoch not in ckpts:
                raise RuntimeError(f"no checkpoint at epoch {epoch} for model '{model_slug}'")
            pth = ckpts[epoch]
            log_dir = config.APPLIO_LOGS / model_slug
            idx_files = list(log_dir.glob(f"{model_slug}*.index"))
            if not idx_files:
                raise RuntimeError(f"no index file for model '{model_slug}'")
            idx = idx_files[0]
        else:
            pth, idx = applio_runner.find_best_checkpoint(model_slug)

        # 4. Convert
        await _set(job, stage="converting", progress=50, message="converting voice")
        converted = job_dir / "converted.wav"
        await applio_runner.infer(pth, idx, vocals_in, converted, pitch=pitch)

        # 5. Mix
        await _set(job, stage="mixing", progress=85, message="mixing final track")
        await mix(converted, instrumental, output_path)

        job.result = {
            "output_path": str(output_path),
            "output_url": f"/jobs/{job.id}/output",
            "duration_sec": _audio_duration(output_path),
            "checkpoint_used": str(pth),
        }
        job.status = JobStatus.DONE
        await _set(job, stage="done", progress=100, message="cover ready")
    except Exception as exc:
        log.exception("cover job %s failed", job.id)
        job.status = JobStatus.FAILED
        job.error = str(exc)
        await _set(job, stage="failed", message=str(exc))
    finally:
        flusher.cancel()
        import time as _t
        job.finished_at = _t.time()
        # Clean intermediate files but keep the final output
        for f in job_dir.glob("*"):
            try:
                f.unlink()
            except Exception:
                pass
        try:
            job_dir.rmdir()
        except Exception:
            pass
        await _callback(job, terminal=True)


def _audio_duration(path: Path) -> float:
    try:
        import subprocess, json
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", str(path)],
            text=True, timeout=10,
        )
        return float(json.loads(out)["format"]["duration"])
    except Exception:
        return 0.0

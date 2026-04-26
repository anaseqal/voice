# voice-worker

FastAPI worker that runs on a RunPod GPU pod. Drives Applio for training and inference, plus `audio-separator` for vocal isolation and `ffmpeg` for mixing. Called over HTTPS by the web app.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | GPU + disk + worker status |
| POST | `/train` | bearer | start a training job |
| POST | `/cover` | bearer | start a cover job |
| GET | `/jobs/{id}` | bearer | poll job state |
| GET | `/jobs/{id}/output` | bearer | download cover output WAV |
| GET | `/models` | bearer | list models present on disk |
| DELETE | `/models/{slug}` | bearer | delete a model + dataset |

All POSTs accept JSON. Auth: `Authorization: Bearer $WORKER_BEARER_TOKEN`.

## One-time setup on the RunPod pod

Assumes Applio is already installed at `/workspace/Applio` (the working setup we have).

```bash
# clone this repo onto the network volume
cd /workspace
git clone https://github.com/<you>/voice voice-repo
ln -s /workspace/voice-repo/worker /workspace/voiceapp-worker

# system deps (ffmpeg already there, but belt-and-braces)
apt-get install -y ffmpeg libportaudio2 tmux jq

# pick a strong shared secret and persist it
echo 'export WORKER_BEARER_TOKEN="<generate-a-long-random-string>"' >> ~/.bashrc
source ~/.bashrc

# launch
cd /workspace/voiceapp-worker
./start.sh
```

Verify:

```bash
curl -s http://localhost:8000/health | jq .
```

Expose port 8000 via the RunPod proxy (Pod template → Expose HTTP Port 8000). Public URL becomes:

```
https://<pod-id>-8000.proxy.runpod.net
```

## Example calls

### Start training

```bash
curl -X POST https://<pod-id>-8000.proxy.runpod.net/train \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "rashid",
    "song_urls": [
      "https://www.youtube.com/watch?v=...",
      "https://example.com/song2.mp3"
    ],
    "callback_url": "https://voice.ihub2.com/api/callbacks/training/abc123"
  }'
# → {"job_id": "...", "status": "queued"}
```

### Start a cover

```bash
curl -X POST https://<pod-id>-8000.proxy.runpod.net/cover \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model_slug": "rashid",
    "audio_url": "https://voice.ihub2.com/files/uploads/xyz.mp3",
    "callback_url": "https://voice.ihub2.com/api/callbacks/covers/job123"
  }'
```

### Download output

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -o cover.wav \
  https://<pod-id>-8000.proxy.runpod.net/jobs/<job_id>/output
```

## Production training defaults (locked)

These match the values discussed in planning. Override per-call via `settings:` in the request body, or globally via env vars.

| Setting | Value | Env var |
|---|---|---|
| Sample rate | 48000 | `TRAIN_SAMPLE_RATE` |
| Vocoder | RefineGAN | `TRAIN_VOCODER` |
| Pitch extractor | rmvpe | `TRAIN_PITCH_METHOD` |
| Embedder | contentvec | `TRAIN_EMBEDDER` |
| Total epochs | 500 | `TRAIN_TOTAL_EPOCHS` |
| Save every | 25 epochs | `TRAIN_SAVE_EVERY` |
| Batch size | auto from VRAM | `TRAIN_BATCH_SIZE` |

## Inference defaults

| Setting | Value | Env var |
|---|---|---|
| Index influence | 0.65 | `INFER_INDEX_RATE` |
| F0 method | rmvpe | `INFER_F0_METHOD` |
| Protect voiceless | 0.33 | `INFER_PROTECT` |
| Vocal gain | 1.3 | `MIX_VOCAL_GAIN` |
| Instrumental gain | 0.9 | `MIX_INSTR_GAIN` |
| Limiter | 0.95 | `MIX_LIMIT` |

## Filesystem layout

```
/workspace/
├── Applio/                              # Applio installation (existing)
│   ├── .venv/                           # we reuse this venv
│   └── logs/<slug>/                     # checkpoints + index live here
├── dataset/<slug>/
│   ├── raw/song_01.mp3                  # downloaded
│   └── vocals/song_01_(Vocals)_*.wav    # isolated
└── voiceapp-worker/                     # this code (symlink to repo)
    ├── jobs/<job_id>/                   # temp per-cover work (auto-cleaned)
    ├── outputs/<job_id>.wav             # final cover outputs
    └── worker.log
```

## State + resilience

v1 keeps job state in memory. If the pod restarts, in-flight jobs are lost. The web app should detect timeouts and mark stale jobs as failed; users re-submit. Final cover outputs persist on disk under `outputs/`.

Phase 2 will add SQLite job persistence on the pod if needed.

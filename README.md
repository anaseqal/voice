# voice — singer voice cloning service

Self-hosted web app that trains RVC voice models from a list of song URLs and uses them to generate covers from any uploaded MP3.

## Architecture

```
voice.ihub2.com  ─── Cloudflare ─── Vultr CPU (Frankfurt, Forge-managed)
                                      │
                                      │  Next.js + SQLite + storage
                                      │
                                      └── HTTPS + Bearer ──► RunPod GPU pod (EU-RO-1)
                                                                Python worker:
                                                                  Applio (RVC)
                                                                  audio-separator (UVR)
                                                                  yt-dlp + ffmpeg
```

## Repos

```
voice/
├── worker/        Python FastAPI worker — runs on RunPod GPU pod
└── web/           Next.js 14 app — runs on Vultr CPU via Forge
```

See [`worker/README.md`](worker/README.md) for worker setup and API.

Web app docs land here in Phase 1.

## Build phases

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ done | Worker on RunPod (FastAPI + Applio + UVR + ffmpeg) |
| 1 | next | Next.js skeleton, Prisma + SQLite, auth, API routes |
| 2 | | UI: Train, Cover, Models gallery |
| 3 | | Forge deploy + Cloudflare DNS + SSL |
| 4 | | RunPod auto start/stop |

## Locked decisions

- **Domain**: `voice.ihub2.com`
- **Web hosting**: Vultr CPU (Frankfurt) via Laravel Forge
- **GPU**: RunPod pod (EU-RO-1) — RTX 5090 / A100 / L40S
- **Stack**: Next.js 14 (TypeScript) + SQLite + Prisma + shadcn/ui
- **Auth**: single-user, NextAuth credentials
- **Worker**: Python FastAPI behind Bearer token
- **YouTube support**: yes, via yt-dlp
- **No upload size cap**

## Production training settings (locked)

| Setting | Value |
|---|---|
| Sample rate | 48000 |
| Vocoder | RefineGAN |
| Pitch extractor | rmvpe |
| Embedder | contentvec |
| Epochs | 500 (save every 25) |
| Batch size | auto from VRAM |

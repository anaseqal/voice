# voice — singer voice cloning service

Self-hosted web app that trains RVC voice models from song URLs and uses them to generate covers from any uploaded MP3.

Production at: **voice.ihub2.com**

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

## Repo layout

```
voice/                           ← Next.js project root (Forge deploys this)
├── app/                         App Router pages + API routes
├── components/
├── lib/                         db, runpod client, auth, storage
├── prisma/schema.prisma
├── middleware.ts                session gate
├── package.json
├── next.config.mjs
├── ...
└── worker/                      Python FastAPI worker — runs on RunPod
    ├── worker.py
    ├── pipeline.py
    ├── applio_runner.py
    └── README.md                worker setup + API docs
```

## Local dev

```bash
bun install
cp .env.example .env
# fill in env — generate secrets:
bun run lib/hash.ts 'your-admin-password'   # → AUTH_PASSWORD_HASH
openssl rand -hex 32                        # → SESSION_PASSWORD
openssl rand -hex 32                        # → CALLBACK_BEARER_TOKEN
# WORKER_BEARER_TOKEN must match what's set on the RunPod pod

bunx prisma db push
mkdir -p data/storage/{uploads,outputs,avatars}
bun dev                          # http://localhost:3000
```

## UI routes

| Path | Purpose |
|---|---|
| `/login` | sign in |
| `/cover` | submit a cover job (default landing) |
| `/train` | start training a new singer |
| `/models` | gallery of trained singers |
| `/models/[id]` | model detail + live progress |
| `/covers` | history |
| `/covers/[id]` | cover result + audio player |

## API routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | login |
| POST | `/api/auth/logout` | logout |
| GET/POST | `/api/models` | list / create |
| GET/DELETE | `/api/models/[id]` | one model |
| GET/POST | `/api/covers` | list / submit |
| GET | `/api/covers/[id]` | one cover |
| POST | `/api/callbacks/training/[id]` | worker → us |
| POST | `/api/callbacks/covers/[id]` | worker → us |
| GET | `/files/...` | serve uploads/outputs/avatars |
| GET | `/api/health` | self + worker health |

## Production deploy via Forge

1. Site `voice.ihub2.com` on Vultr CPU (Frankfurt) — App server type
2. Connect this repo `anaseqal/voice`, branch `main` — **leave Web Directory at default `/`**
3. Atomic deploys ✅ ON
4. Add env vars (Forge → Site → Environment) — see `.env.example`
5. **DATABASE_URL** and **STORAGE_DIR** point to `/home/forge/voice.ihub2.com/shared/data/...` so they survive deploys
6. Deploy script: see below
7. Nginx: proxy `/` → `127.0.0.1:3000`, `client_max_body_size 500m`
8. Let's Encrypt SSL one-click
9. Cloudflare DNS `voice.ihub2.com` → Vultr IP

### Deploy script (Forge → Site → Deployment)

```bash
cd $FORGE_SITE_PATH

$HOME/.bun/bin/bun install --frozen-lockfile

SHARED=/home/forge/voice.ihub2.com/shared
mkdir -p $SHARED/data/storage/uploads
mkdir -p $SHARED/data/storage/outputs
mkdir -p $SHARED/data/storage/avatars

rm -rf $FORGE_SITE_PATH/data
ln -sfn $SHARED/data $FORGE_SITE_PATH/data

$HOME/.bun/bin/bunx prisma generate
$HOME/.bun/bin/bunx prisma migrate deploy 2>/dev/null || $HOME/.bun/bin/bunx prisma db push --accept-data-loss

$HOME/.bun/bin/bun run build

if pm2 list | grep -q voice-web; then
  pm2 restart voice-web --update-env
else
  pm2 start "$HOME/.bun/bin/bun run start" --name voice-web \
    --cwd /home/forge/voice.ihub2.com/current
fi
pm2 save
```

## Storage layout (production)

```
/home/forge/voice.ihub2.com/
├── current → releases/<latest>          ← pm2 serves this
├── releases/<timestamp>/                ← per-deploy code
│   └── data → ../../shared/data         ← symlinked each deploy
└── shared/
    └── data/
        ├── voice.db
        └── storage/
            ├── uploads/
            ├── outputs/
            └── avatars/
```

## Worker setup

See [`worker/README.md`](worker/README.md). Runs on a RunPod pod with Applio installed. Web app talks to it via HTTPS + Bearer token.

## Production training settings (locked)

| Setting | Value |
|---|---|
| Sample rate | 48000 |
| Vocoder | RefineGAN |
| Pitch extractor | rmvpe |
| Embedder | contentvec |
| Epochs | 500 (save every 25) |
| Batch size | auto from VRAM |

Override via env vars on the worker (see `worker/README.md`).

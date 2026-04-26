# voice-web

Next.js 14 web app for managing singer voice models and generating covers. Talks to the Python worker on RunPod over HTTPS.

## Local dev

```bash
cd web
bun install
cp .env.example .env
# edit .env — generate password hash and tokens:
bun run lib/hash.ts 'your-admin-password'   # paste output as AUTH_PASSWORD_HASH
openssl rand -hex 32                        # paste as SESSION_PASSWORD
openssl rand -hex 32                        # paste as CALLBACK_BEARER_TOKEN
# WORKER_BEARER_TOKEN must match what's set on the RunPod pod

bunx prisma db push       # creates ./data/voice.db
mkdir -p data/storage/{uploads,outputs,avatars}
bun dev                   # http://localhost:3000
```

## Routes

| Path | Purpose |
|---|---|
| `/login` | sign in |
| `/cover` | submit a cover job |
| `/train` | start training a new singer |
| `/models` | gallery of trained singers |
| `/models/[id]` | model detail + live progress |
| `/covers` | history of covers |
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

1. Create site `voice.ihub2.com` on the Vultr CPU server (App type: Next.js)
2. Connect this repo (`web/` is the project root — set in Forge site settings)
3. Build command: `bun install && bun run build`
4. Start command: `bun run start`
5. Add env vars in Forge → matching `.env.example`
6. Enable Let's Encrypt SSL
7. Cloudflare DNS: `voice.ihub2.com` → Vultr IP
8. Push to `main` → Forge auto-deploys

## Storage layout (local + production)

```
data/
├── voice.db                ← SQLite
└── storage/
    ├── uploads/{coverId}.mp3
    ├── outputs/{coverId}.wav
    └── avatars/{modelId}.{jpg,png,webp}
```

`STORAGE_DIR` env var overrides location (default `./data/storage`).

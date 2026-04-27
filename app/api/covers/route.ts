import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSessionOrJson } from "@/lib/auth";
import { worker, type CoverSettings } from "@/lib/runpod";
import { saveUpload } from "@/lib/storage";

function parseCoverSettings(form: FormData, pitch: number, epoch: number | null): CoverSettings {
  const s: CoverSettings = { pitch };
  if (epoch !== null) s.epoch = epoch;
  const indexRate = form.get("indexRate");
  if (typeof indexRate === "string" && indexRate !== "") {
    const n = parseFloat(indexRate);
    if (Number.isFinite(n)) s.index_rate = Math.max(0, Math.min(1, n));
  }
  const protect = form.get("protect");
  if (typeof protect === "string" && protect !== "") {
    const n = parseFloat(protect);
    if (Number.isFinite(n)) s.protect = Math.max(0, Math.min(0.5, n));
  }
  const skipIsolation = form.get("skipIsolation");
  if (skipIsolation !== null)
    s.skip_isolation = skipIsolation === "on" || skipIsolation === "true";
  return s;
}

export async function GET() {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const covers = await db.cover.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { model: { select: { slug: true, displayName: true, avatarPath: true } } },
  });
  return NextResponse.json({ covers });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const form = await req.formData();
  const modelId = String(form.get("modelId") ?? "");
  const audio = form.get("audio");
  const audioUrl = String(form.get("audioUrl") ?? "").trim();
  const pitch = parseInt(String(form.get("pitch") ?? "0"), 10) || 0;
  const epochRaw = String(form.get("epoch") ?? "");
  const userEpoch = epochRaw ? parseInt(epochRaw, 10) : null;

  if (!modelId) {
    return NextResponse.json({ error: "modelId required" }, { status: 400 });
  }

  const model = await db.model.findUnique({ where: { id: modelId } });
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 });
  if (model.status !== "ready") {
    return NextResponse.json(
      { error: `model not ready (status=${model.status})` },
      { status: 409 }
    );
  }

  // Resolution order for which checkpoint to convert against:
  //   1. per-cover form override (Advanced → epoch)
  //   2. model.defaultEpoch (set from the model detail page)
  //   3. null → worker picks best (lowest loss) automatically
  const epoch = userEpoch ?? model.defaultEpoch ?? null;

  // Create the cover row first to get an id
  const cover = await db.cover.create({
    data: {
      modelId,
      inputName: audio instanceof File ? audio.name : audioUrl || "remote.mp3",
      inputPath: "",
      inputUrl: audioUrl || null,
      status: "queued",
      stage: "queued",
      pitch,
      epoch: epoch ?? undefined,
    },
  });

  let workerAudioUrl: string;
  if (audio instanceof File && audio.size > 0) {
    const saved = await saveUpload(audio, cover.id);
    await db.cover.update({
      where: { id: cover.id },
      data: { inputPath: saved.path },
    });
    workerAudioUrl = `${env.PUBLIC_BASE_URL}${saved.url}`;
  } else if (audioUrl) {
    workerAudioUrl = audioUrl;
  } else {
    await db.cover.delete({ where: { id: cover.id } });
    return NextResponse.json(
      { error: "audio file or audioUrl required" },
      { status: 400 }
    );
  }

  try {
    const callbackUrl = `${env.PUBLIC_BASE_URL}/api/callbacks/covers/${cover.id}`;
    const res = await worker.startCover({
      model_slug: model.slug,
      audio_url: workerAudioUrl,
      callback_url: callbackUrl,
      callback_token: env.CALLBACK_BEARER_TOKEN,
      settings: parseCoverSettings(form, pitch, epoch),
    });
    await db.cover.update({
      where: { id: cover.id },
      data: { workerJobId: res.job_id, status: "running", stage: "queued" },
    });
  } catch (err) {
    await db.cover.update({
      where: { id: cover.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json({ error: "worker unreachable" }, { status: 502 });
  }

  return NextResponse.json({ id: cover.id });
}

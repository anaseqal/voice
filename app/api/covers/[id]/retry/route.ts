import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSessionOrJson } from "@/lib/auth";
import { worker } from "@/lib/runpod";

export async function POST(
  _: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const cover = await db.cover.findUnique({
    where: { id },
    include: {
      model: { select: { slug: true, status: true } },
    },
  });
  if (!cover) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cover.status === "running" || cover.status === "queued") {
    return NextResponse.json(
      { error: "already running", status: cover.status },
      { status: 409 }
    );
  }
  if (cover.model.status !== "ready") {
    return NextResponse.json(
      { error: `model is ${cover.model.status}, not ready` },
      { status: 409 }
    );
  }

  // Recover the audio source. Prefer the uploaded file (still on disk under
  // /files/uploads/<cover_id>.<ext>), falling back to the originally pasted
  // URL. The worker re-downloads from whichever URL we send.
  let audioUrl: string;
  if (cover.inputPath) {
    // inputPath looks like {STORAGE_DIR}/uploads/<id>.<ext>; turn it into the
    // public URL the worker can fetch.
    const filename = cover.inputPath.split(/[/\\]/).pop();
    if (!filename) {
      return NextResponse.json(
        { error: "couldn't recover upload path" },
        { status: 500 }
      );
    }
    audioUrl = `${env.PUBLIC_BASE_URL}/files/uploads/${filename}`;
  } else if (cover.inputUrl) {
    audioUrl = cover.inputUrl;
  } else {
    return NextResponse.json(
      { error: "no audio source on this cover" },
      { status: 400 }
    );
  }

  await db.cover.update({
    where: { id },
    data: {
      status: "queued",
      stage: "queued",
      progress: 0,
      message: null,
      error: null,
      logTail: null,
      completedAt: null,
      workerJobId: null,
      outputPath: null,
    },
  });

  try {
    const callbackUrl = `${env.PUBLIC_BASE_URL}/api/callbacks/covers/${id}`;
    const res = await worker.startCover({
      model_slug: cover.model.slug,
      audio_url: audioUrl,
      callback_url: callbackUrl,
      callback_token: env.CALLBACK_BEARER_TOKEN,
      settings: {
        pitch: cover.pitch,
        ...(cover.epoch !== null ? { epoch: cover.epoch } : {}),
      },
    });
    await db.cover.update({
      where: { id },
      data: { workerJobId: res.job_id, status: "running" },
    });
  } catch (err) {
    await db.cover.update({
      where: { id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json(
      { error: "worker unreachable", detail: String(err) },
      { status: 502 }
    );
  }

  return NextResponse.json({ retried: true });
}

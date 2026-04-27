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
  const model = await db.model.findUnique({
    where: { id },
    include: { songs: true },
  });
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (model.status === "training" || model.status === "queued") {
    return NextResponse.json(
      { error: "already running", status: model.status },
      { status: 409 }
    );
  }

  // Reset transient state and re-submit. Songs the worker already has on disk
  // (under /workspace/dataset/<slug>/raw/) won't be redownloaded thanks to
  // reuse_existing.
  await db.model.update({
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
    },
  });
  await db.trainingSong.updateMany({
    where: { modelId: id },
    data: { status: "pending" },
  });

  try {
    const callbackUrl = `${env.PUBLIC_BASE_URL}/api/callbacks/training/${id}`;
    const res = await worker.startTraining({
      slug: model.slug,
      song_urls: model.songs.map((s) => s.url),
      callback_url: callbackUrl,
      callback_token: env.CALLBACK_BEARER_TOKEN,
      reuse_existing: true,
    });
    await db.model.update({
      where: { id },
      data: { workerJobId: res.job_id, status: "queued" },
    });
  } catch (err) {
    await db.model.update({
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

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { worker } from "@/lib/runpod";
import { saveOutputBuffer } from "@/lib/storage";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CALLBACK_BEARER_TOKEN}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const status = body.status as string | undefined;
  const stage = body.stage as string | undefined;
  const progress = typeof body.progress === "number" ? body.progress : undefined;
  const message = body.message as string | undefined;
  const error = body.error as string | null | undefined;
  const result = body.result as Record<string, unknown> | undefined;

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (stage !== undefined) data.stage = stage;
  if (progress !== undefined) data.progress = progress;
  if (message !== undefined) data.message = message;
  if (error !== undefined && error !== null) data.error = String(error);
  if (status === "done") data.completedAt = new Date();
  if (status === "running" && stage === "downloading") data.startedAt = new Date();

  // When done, fetch the output WAV from the worker and store it locally
  if (status === "done") {
    const cover = await db.cover.findUnique({ where: { id } });
    if (cover?.workerJobId) {
      try {
        const res = await worker.fetchOutput(cover.workerJobId);
        if (!res.ok) throw new Error(`worker returned ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const saved = await saveOutputBuffer(buf, `${id}.wav`);
        data.outputPath = saved.path;
      } catch (err) {
        console.error("failed to fetch cover output:", err);
        data.status = "failed";
        data.error = `output fetch failed: ${String(err)}`;
      }
    }
  }

  await db.cover.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

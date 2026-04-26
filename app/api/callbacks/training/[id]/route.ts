import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const status = body.status as string | undefined;
  const stage = body.stage as string | undefined;
  const progress = typeof body.progress === "number" ? body.progress : undefined;
  const message = body.message as string | undefined;
  const error = body.error as string | null | undefined;
  const result = body.result as Record<string, unknown> | undefined;
  const logTail = typeof body.log_tail === "string" ? body.log_tail : undefined;

  // Map worker statuses to our model.status field
  let dbStatus: string | undefined;
  if (status === "running") dbStatus = "training";
  if (status === "done") dbStatus = "ready";
  if (status === "failed") dbStatus = "failed";

  const data: Record<string, unknown> = {};
  if (dbStatus) data.status = dbStatus;
  if (stage !== undefined) data.stage = stage;
  if (progress !== undefined) data.progress = progress;
  if (message !== undefined) data.message = message;
  if (error !== undefined && error !== null) data.error = String(error);
  if (logTail !== undefined) data.logTail = logTail;
  if (status === "done") data.completedAt = new Date();
  if (status === "running" && stage === "downloading") data.startedAt = new Date();

  if (status === "done" && result) {
    if (typeof result.model_pth === "string") data.modelPth = result.model_pth;
    if (typeof result.index_file === "string") data.indexFile = result.index_file;
    if (Array.isArray(result.checkpoints)) {
      data.checkpoints = JSON.stringify(result.checkpoints);
      const epochs = result.checkpoints
        .map((c) => (typeof (c as { epoch?: number }).epoch === "number" ? (c as { epoch: number }).epoch : 0))
        .filter((e) => e > 0);
      if (epochs.length) data.bestEpoch = Math.max(...epochs);
    }
  }

  await db.model.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

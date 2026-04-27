import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionOrJson } from "@/lib/auth";
import { worker } from "@/lib/runpod";

export async function POST(
  _: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const model = await db.model.findUnique({ where: { id } });
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!model.workerJobId) {
    return NextResponse.json(
      { error: "no worker job to stop" },
      { status: 409 }
    );
  }
  if (model.status !== "training" && model.status !== "queued") {
    return NextResponse.json(
      { error: `not running (status=${model.status})`, status: model.status },
      { status: 409 }
    );
  }

  try {
    const res = await worker.cancelJob(model.workerJobId);
    // Optimistically flip to failed so the UI Retry button appears immediately;
    // the worker will also send a "failed" callback when the subprocess exits,
    // which is idempotent here.
    await db.model.update({
      where: { id },
      data: {
        status: "failed",
        error: "Stopped by user — saved checkpoints preserved, click Retry to resume.",
        completedAt: new Date(),
      },
    });
    return NextResponse.json({ stopped: true, worker: res });
  } catch (err) {
    return NextResponse.json(
      {
        error: "stop failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}

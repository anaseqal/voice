import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Mark any in-flight rows as failed when the worker tells us their workerJobId
 * is not in its current registry. Called by the worker on startup so ghost
 * rows from a crash/restart don't sit at status=running forever.
 *
 * Auth: same callback bearer the worker uses for status callbacks. Body shape:
 *   { worker_job_ids: ["...","..."] }   // ids the worker currently knows about
 *
 * Anything in our DB at status running/queued/training whose workerJobId is
 * NOT in that list flips to failed with a 'worker restarted' error.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${env.CALLBACK_BEARER_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.worker_job_ids)) {
    return NextResponse.json(
      { error: "expected { worker_job_ids: string[] }" },
      { status: 400 }
    );
  }
  const live = new Set<string>(body.worker_job_ids.filter((x: unknown) => typeof x === "string"));

  const STALE_ERROR = "Worker restarted before this job finished — please retry.";
  const now = new Date();

  // Models in flight
  const models = await db.model.findMany({
    where: { status: { in: ["queued", "training"] } },
    select: { id: true, workerJobId: true },
  });
  const staleModels = models.filter(
    (m) => !m.workerJobId || !live.has(m.workerJobId)
  );
  if (staleModels.length > 0) {
    await db.model.updateMany({
      where: { id: { in: staleModels.map((m) => m.id) } },
      data: { status: "failed", error: STALE_ERROR, completedAt: now },
    });
  }

  // Covers in flight
  const covers = await db.cover.findMany({
    where: { status: { in: ["queued", "running"] } },
    select: { id: true, workerJobId: true },
  });
  const staleCovers = covers.filter(
    (c) => !c.workerJobId || !live.has(c.workerJobId)
  );
  if (staleCovers.length > 0) {
    await db.cover.updateMany({
      where: { id: { in: staleCovers.map((c) => c.id) } },
      data: { status: "failed", error: STALE_ERROR, completedAt: now },
    });
  }

  return NextResponse.json({
    swept_models: staleModels.length,
    swept_covers: staleCovers.length,
  });
}

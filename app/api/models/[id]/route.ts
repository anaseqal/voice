import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { requireSessionOrJson } from "@/lib/auth";
import { worker } from "@/lib/runpod";
import { PATHS } from "@/lib/storage";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const model = await db.model.findUnique({
    where: { id },
    include: { songs: true, _count: { select: { covers: true } } },
  });
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ model });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const data: { defaultEpoch?: number | null } = {};
  if ("defaultEpoch" in body) {
    const v = body.defaultEpoch;
    if (v === null) data.defaultEpoch = null;
    else if (typeof v === "number" && Number.isFinite(v) && v > 0)
      data.defaultEpoch = Math.floor(v);
    else
      return NextResponse.json(
        { error: "defaultEpoch must be a positive number or null" },
        { status: 400 }
      );
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no editable fields" }, { status: 400 });
  }

  try {
    const model = await db.model.update({ where: { id }, data });
    return NextResponse.json({ model });
  } catch (err) {
    return NextResponse.json(
      {
        error: "update failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const model = await db.model.findUnique({
    where: { id },
    include: { covers: true },
  });
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Clean up local files for every cover that referenced this model: input
  // upload, final output WAV. The DB rows themselves get cascaded by Prisma
  // when the model is deleted (schema: Cover.model has onDelete: Cascade).
  for (const c of model.covers) {
    const candidates: string[] = [];
    if (c.outputPath) candidates.push(c.outputPath);
    candidates.push(join(PATHS.outputs, `${c.id}.wav`));
    if (c.inputPath) candidates.push(c.inputPath);
    for (const p of candidates) {
      try {
        await unlink(p);
      } catch {
        // file already gone or never existed — fine
      }
    }
  }

  // Avatar
  if (model.avatarPath) {
    const fname = model.avatarPath.split("/").pop();
    if (fname) {
      try {
        await unlink(join(PATHS.avatars, fname));
      } catch {}
    }
  }

  // Best-effort: ask the worker to wipe its files
  try {
    await worker.deleteModel(model.slug);
  } catch (err) {
    console.warn("worker delete failed (continuing):", err);
  }

  try {
    await db.model.delete({ where: { id } });
  } catch (err) {
    console.error("model delete failed:", err);
    return NextResponse.json(
      {
        error: "delete failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ deleted: true });
}

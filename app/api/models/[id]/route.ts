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

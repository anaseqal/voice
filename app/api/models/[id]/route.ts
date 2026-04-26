import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionOrJson } from "@/lib/auth";
import { worker } from "@/lib/runpod";

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
  const model = await db.model.findUnique({ where: { id } });
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Best-effort: ask the worker to wipe its files
  try {
    await worker.deleteModel(model.slug);
  } catch (err) {
    console.warn("worker delete failed (continuing):", err);
  }

  await db.model.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}

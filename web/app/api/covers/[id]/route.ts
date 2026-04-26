import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSessionOrJson } from "@/lib/auth";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const cover = await db.cover.findUnique({
    where: { id },
    include: {
      model: { select: { slug: true, displayName: true, avatarPath: true } },
    },
  });
  if (!cover) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ cover });
}

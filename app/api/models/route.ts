import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSessionOrJson } from "@/lib/auth";
import { worker } from "@/lib/runpod";
import { saveAvatar } from "@/lib/storage";
import { slugify } from "@/lib/utils";

const SongUrl = z.string().url();

const FormSchema = z.object({
  displayName: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,40}$/),
  songUrls: z.array(SongUrl).min(1).max(50),
});

export async function GET() {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const models = await db.model.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { songs: true, covers: true } } },
  });
  return NextResponse.json({ models });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionOrJson();
  if (auth instanceof Response) return auth;

  const form = await req.formData();
  const displayName = String(form.get("displayName") ?? "").trim();
  const rawSlug = String(form.get("slug") ?? "").trim() || slugify(displayName);
  const songUrlsRaw = String(form.get("songUrls") ?? "");
  const avatar = form.get("avatar");

  const songUrls = songUrlsRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = FormSchema.safeParse({ displayName, slug: rawSlug, songUrls });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await db.model.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return NextResponse.json({ error: "slug already exists" }, { status: 409 });
  }

  // Create row first, then upload avatar (we need the id)
  const model = await db.model.create({
    data: {
      slug: parsed.data.slug,
      displayName: parsed.data.displayName,
      status: "queued",
      stage: "queued",
      progress: 0,
      songs: { create: parsed.data.songUrls.map((url) => ({ url })) },
    },
  });

  if (avatar instanceof File && avatar.size > 0) {
    try {
      const saved = await saveAvatar(avatar, model.id);
      await db.model.update({
        where: { id: model.id },
        data: { avatarPath: saved.url },
      });
    } catch (err) {
      // non-fatal, log and continue
      console.warn("avatar save failed", err);
    }
  }

  // Kick off the worker
  try {
    const callbackUrl = `${env.PUBLIC_BASE_URL}/api/callbacks/training/${model.id}`;
    const res = await worker.startTraining({
      slug: parsed.data.slug,
      song_urls: parsed.data.songUrls,
      callback_url: callbackUrl,
      callback_token: env.CALLBACK_BEARER_TOKEN,
    });
    await db.model.update({
      where: { id: model.id },
      data: { workerJobId: res.job_id, status: "training", stage: "queued" },
    });
  } catch (err) {
    await db.model.update({
      where: { id: model.id },
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

  return NextResponse.json({ id: model.id, slug: model.slug });
}

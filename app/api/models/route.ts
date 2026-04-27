import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSessionOrJson } from "@/lib/auth";
import { worker, type TrainSettings } from "@/lib/runpod";
import { saveAvatar } from "@/lib/storage";
import { slugify } from "@/lib/utils";

const SongUrl = z.string().url();

const FormSchema = z.object({
  displayName: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,40}$/),
  songUrls: z.array(SongUrl).min(1).max(50),
});

function parseTrainSettings(form: FormData): TrainSettings {
  const s: TrainSettings = {};
  const totalEpoch = form.get("totalEpoch");
  if (typeof totalEpoch === "string" && totalEpoch !== "" && totalEpoch !== "auto") {
    const n = parseInt(totalEpoch, 10);
    if (Number.isFinite(n) && n > 0) s.total_epoch = n;
  }
  const vocoder = form.get("vocoder");
  if (typeof vocoder === "string" && vocoder !== "") s.vocoder = vocoder;
  const twoPass = form.get("twoPassIsolation");
  if (twoPass !== null) s.two_pass_isolation = twoPass === "on" || twoPass === "true";
  const trim = form.get("trimSilence");
  if (trim !== null) s.trim_silence = trim === "on" || trim === "true";
  const cut = form.get("cutPreprocess");
  if (cut === "Skip" || cut === "Simple" || cut === "Automatic")
    s.cut_preprocess = cut;
  return s;
}

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

  const settings = parseTrainSettings(form);

  // Create row first, then upload avatar (we need the id). Persist the
  // user's advanced settings so retry can replay them.
  const model = await db.model.create({
    data: {
      slug: parsed.data.slug,
      displayName: parsed.data.displayName,
      status: "queued",
      stage: "queued",
      progress: 0,
      settingsJson: Object.keys(settings).length > 0 ? JSON.stringify(settings) : null,
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
      settings,
    });
    // Leave status as "queued" until the worker actually picks the job off
    // its serial dispatcher and fires a "running" callback. With the queue,
    // multiple submissions sit at status=queued and flip to training one at
    // a time as the dispatcher pulls them.
    await db.model.update({
      where: { id: model.id },
      data: { workerJobId: res.job_id, stage: "queued" },
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

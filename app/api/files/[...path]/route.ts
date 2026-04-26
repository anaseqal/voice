import { NextRequest } from "next/server";
import { stat, readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { env } from "@/lib/env";

const MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const rel = normalize(path.join("/")).replace(/^\/+/, "");
  if (rel.startsWith("..")) return new Response("forbidden", { status: 403 });

  // Only serve from these subdirs
  const [bucket] = rel.split("/");
  if (!["uploads", "outputs", "avatars"].includes(bucket)) {
    return new Response("not found", { status: 404 });
  }

  const full = join(env.STORAGE_DIR, rel);
  try {
    const st = await stat(full);
    if (!st.isFile()) return new Response("not found", { status: 404 });
    const buf = await readFile(full);
    const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
    return new Response(buf, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "content-length": String(st.size),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

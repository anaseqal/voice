import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { env } from "./env";

const ROOT = env.STORAGE_DIR;

export const PATHS = {
  uploads: join(ROOT, "uploads"),
  outputs: join(ROOT, "outputs"),
  avatars: join(ROOT, "avatars"),
};

export async function ensureStorageDirs() {
  for (const p of Object.values(PATHS)) {
    if (!existsSync(p)) await mkdir(p, { recursive: true });
  }
}

export async function saveUpload(
  file: File,
  id: string
): Promise<{ path: string; url: string }> {
  await ensureStorageDirs();
  const ext = extname(file.name) || ".bin";
  const safeExt = ext.replace(/[^a-z0-9.]/gi, "").slice(0, 8) || ".bin";
  const filename = `${id}${safeExt}`;
  const path = join(PATHS.uploads, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path, buf);
  return { path, url: `/files/uploads/${filename}` };
}

export async function saveAvatar(
  file: File,
  id: string
): Promise<{ path: string; url: string }> {
  await ensureStorageDirs();
  const ext = extname(file.name).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    throw new Error("avatar must be JPG/PNG/WEBP");
  }
  const filename = `${id}${ext}`;
  const path = join(PATHS.avatars, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path, buf);
  return { path, url: `/files/avatars/${filename}` };
}

export async function saveOutputBuffer(
  buf: Buffer,
  filename: string
): Promise<{ path: string; url: string }> {
  await ensureStorageDirs();
  const path = join(PATHS.outputs, filename);
  await writeFile(path, buf);
  return { path, url: `/files/outputs/${filename}` };
}

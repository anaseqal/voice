function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/**
 * Read AUTH_PASSWORD_HASH from env. We accept it as base64 to avoid the
 * `@next/env` parser interpolating the `$` characters in bcrypt hashes
 * (e.g. `$2a$12$...`). Encode the hash with: `echo -n '<hash>' | base64`.
 * Falls back to raw if it doesn't decode to a valid bcrypt prefix.
 */
function readPasswordHash(): string {
  const raw = req("AUTH_PASSWORD_HASH");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (/^\$2[aby]\$\d{2}\$/.test(decoded)) return decoded;
  } catch {
    // fall through
  }
  return raw;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  AUTH_USERNAME: req("AUTH_USERNAME"),
  AUTH_PASSWORD_HASH: readPasswordHash(),
  SESSION_PASSWORD: req("SESSION_PASSWORD"),
  WORKER_BASE_URL: req("WORKER_BASE_URL"),
  WORKER_BEARER_TOKEN: req("WORKER_BEARER_TOKEN"),
  PUBLIC_BASE_URL: req("PUBLIC_BASE_URL"),
  CALLBACK_BEARER_TOKEN: req("CALLBACK_BEARER_TOKEN"),
  STORAGE_DIR: process.env.STORAGE_DIR ?? "./data/storage",
};

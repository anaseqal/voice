function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  AUTH_USERNAME: req("AUTH_USERNAME"),
  AUTH_PASSWORD_HASH: req("AUTH_PASSWORD_HASH"),
  SESSION_PASSWORD: req("SESSION_PASSWORD"),
  WORKER_BASE_URL: req("WORKER_BASE_URL"),
  WORKER_BEARER_TOKEN: req("WORKER_BEARER_TOKEN"),
  PUBLIC_BASE_URL: req("PUBLIC_BASE_URL"),
  CALLBACK_BEARER_TOKEN: req("CALLBACK_BEARER_TOKEN"),
  STORAGE_DIR: process.env.STORAGE_DIR ?? "./data/storage",
};

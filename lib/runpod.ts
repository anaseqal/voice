import { env } from "./env";

export type WorkerHealth = {
  status: string;
  gpu: { name: string; vram_gb: number; auto_batch_size: number };
  disk: { total_gb: number; free_gb: number; used_pct: number };
  applio_dir: string;
  applio_present: boolean;
  active_jobs: number;
};

export type WorkerJob = {
  id: string;
  type: "train" | "cover";
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  stage: string;
  progress: number;
  message: string;
  error: string | null;
  result: Record<string, unknown>;
};

export type TrainSettings = {
  total_epoch?: number;
  vocoder?: string;
  sample_rate?: number;
  save_every?: number;
  batch_size?: number;
  two_pass_isolation?: boolean;
  trim_silence?: boolean;
  cut_preprocess?: "Skip" | "Simple" | "Automatic";
};

export type CoverSettings = {
  pitch?: number;
  epoch?: number;
  index_rate?: number;
  protect?: number;
  volume_envelope?: number;
  skip_isolation?: boolean;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${env.WORKER_BASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${env.WORKER_BEARER_TOKEN}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`worker ${path} → ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

export const worker = {
  health: () => call<WorkerHealth>("/health"),

  startTraining: (body: {
    slug: string;
    song_urls: string[];
    callback_url: string;
    callback_token: string;
    settings?: TrainSettings;
    reuse_existing?: boolean;
  }) =>
    call<{ job_id: string; status: string }>("/train", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  startCover: (body: {
    model_slug: string;
    audio_url: string;
    callback_url: string;
    callback_token: string;
    settings?: CoverSettings;
  }) =>
    call<{ job_id: string; status: string }>("/cover", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getJob: (jobId: string) => call<WorkerJob>(`/jobs/${jobId}`),

  cancelJob: (jobId: string) =>
    call<{ job_id: string; status: string; cancelled: boolean }>(
      `/jobs/${jobId}/cancel`,
      { method: "POST" }
    ),

  listModels: () =>
    call<{ models: Array<{ slug: string; best_epoch: number }> }>("/models"),

  deleteModel: (slug: string) =>
    call<{ deleted: string[] }>(`/models/${slug}`, { method: "DELETE" }),

  /** Stream the cover output WAV from the worker. Returned as a Response. */
  fetchOutput: (workerJobId: string) =>
    fetch(
      `${env.WORKER_BASE_URL.replace(/\/$/, "")}/jobs/${workerJobId}/output`,
      {
        headers: { Authorization: `Bearer ${env.WORKER_BEARER_TOKEN}` },
      }
    ),
};

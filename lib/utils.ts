import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString();
}

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Format a duration in seconds as h:mm:ss / m:ss / Ns. */
export function fmtDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}

/** Estimate remaining seconds from a buffer of recent (timestamp_ms, progress)
 * samples. Uses the rate over the most-recent window so ETA reflects the
 * *current* phase's pace rather than the average since job start — important
 * because our pipeline progress is wildly non-linear (training is 50% of the
 * progress range but ~85% of wall time). Returns null when there isn't enough
 * data, progress hasn't moved in the window, or the job is done. */
export function estimateEta(
  samples: { t: number; p: number }[],
  currentProgress: number
): number | null {
  if (currentProgress <= 0 || currentProgress >= 100) return null;
  if (samples.length < 2) return null;
  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  const dp = newest.p - oldest.p;
  const dt = (newest.t - oldest.t) / 1000;
  if (dp <= 0 || dt <= 0) return null;
  const rate = dp / dt; // %/sec over the window
  const remaining = 100 - currentProgress;
  return remaining / rate;
}

export function statusColor(status: string): string {
  switch (status) {
    case "ready":
    case "done":
      return "bg-green-500";
    case "training":
    case "running":
    case "queued":
      return "bg-blue-500";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Clock, Hourglass } from "lucide-react";
import { estimateEta, fmtDuration } from "@/lib/utils";

const ETA_WINDOW_MS = 90_000;

export function TimeStats({
  startedAt,
  completedAt,
  progress,
  isRunning,
}: {
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  isRunning: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [isRunning]);

  // Sliding-window samples for ETA. We push on every progress change and drop
  // anything older than ETA_WINDOW_MS. Fewer than 2 samples → no ETA yet.
  const samplesRef = useRef<{ t: number; p: number }[]>([]);
  useEffect(() => {
    if (!isRunning || progress <= 0 || progress >= 100) {
      samplesRef.current = [];
      return;
    }
    const t = Date.now();
    const buf = samplesRef.current;
    const last = buf[buf.length - 1];
    if (!last || last.p !== progress) {
      buf.push({ t, p: progress });
    }
    samplesRef.current = buf.filter((s) => t - s.t <= ETA_WINDOW_MS);
  }, [progress, isRunning]);

  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : now;
  const elapsedSec = Math.max(0, (end - start) / 1000);
  const eta = isRunning ? estimateEta(samplesRef.current, progress) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground tabular-nums">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        {fmtDuration(elapsedSec)}
      </span>
      {eta !== null && (
        <span className="inline-flex items-center gap-1.5">
          <Hourglass className="h-3.5 w-3.5" />
          ~{fmtDuration(eta)}
        </span>
      )}
    </div>
  );
}

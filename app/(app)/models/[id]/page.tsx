"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
  Hourglass,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { Avatar } from "@/components/avatar";
import { cn, estimateEta, fmtDate, fmtDuration } from "@/lib/utils";

type Song = { id: string; url: string; status: string };
type Model = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  progress: number;
  stage: string | null;
  message: string | null;
  error: string | null;
  logTail: string | null;
  avatarPath: string | null;
  bestEpoch: number | null;
  checkpoints: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  songs: Song[];
  _count: { covers: number };
};

const STAGE_KEYS = [
  "downloading",
  "isolating",
  "preprocessing",
  "extracting",
  "training",
  "indexing",
] as const;

export default function ModelDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const t = useTranslations("model");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const tStatus = useTranslations("status");
  const tModels = useTranslations("models");
  const [model, setModel] = useState<Model | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    function load() {
      fetch(`/api/models/${id}`)
        .then((r) => r.json())
        .then((d) => setModel(d.model ?? null));
    }
    load();
    const handle = setInterval(load, 3000);
    return () => clearInterval(handle);
  }, [id]);

  async function del() {
    if (!confirm(tModels("deleteConfirm"))) return;
    const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(tModels("deleted"));
      router.push("/models");
    } else {
      toast.error(tModels("deleteFailed"));
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/models/${id}/retry`, { method: "POST" });
      if (res.ok) {
        toast.success(t("retried"));
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? t("retryFailed"));
      }
    } finally {
      setRetrying(false);
    }
  }

  if (!model) return <PageSkeleton />;

  const checkpoints = model.checkpoints
    ? (JSON.parse(model.checkpoints) as { epoch: number; path: string }[])
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Avatar src={model.avatarPath} name={model.displayName} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {model.displayName}
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {model.slug}
          </p>
        </div>
        <StatusBadge status={model.status} />
        <button
          onClick={del}
          className="btn btn-outline border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={tCommon("delete")}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{tCommon("delete")}</span>
        </button>
      </div>

      {/* In progress */}
      {model.status !== "ready" && model.status !== "failed" && (
        <div className="surface space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">{t("trainingPipeline")}</h2>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {model.progress}%
            </span>
          </div>
          <ProgressBar value={model.progress} />
          <TimeStats
            startedAt={model.startedAt}
            completedAt={model.completedAt}
            progress={model.progress}
            isRunning
          />
          <StageList
            tStages={tStages}
            tStatus={tStatus}
            status={model.status}
            stage={model.stage}
            message={model.message}
          />
          <LogTail text={model.logTail} title={t("workerOutput")} />
        </div>
      )}

      {/* Failed */}
      {model.status === "failed" && (
        <div className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-destructive">{t("failedTitle")}</p>
              <p className="mt-1 text-destructive/80">
                {model.error ?? tCommon("none")}
              </p>
            </div>
          </div>
          <StageList
            tStages={tStages}
            tStatus={tStatus}
            status={model.status}
            stage={model.stage}
            message={null}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              onClick={retry}
              disabled={retrying}
              className="btn btn-primary"
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {retrying ? tCommon("retrying") : tCommon("retry")}
            </button>
            <p className="text-xs text-muted-foreground">{t("retryHint")}</p>
          </div>
          <LogTail text={model.logTail} title={t("workerOutput")} />
        </div>
      )}

      {/* Ready */}
      {model.status === "ready" && (
        <div className="surface space-y-4 p-4 sm:p-5">
          <StageList
            tStages={tStages}
            tStatus={tStatus}
            status={model.status}
            stage={model.stage}
            message={null}
          />
          <TimeStats
            startedAt={model.startedAt}
            completedAt={model.completedAt}
            progress={100}
            isRunning={false}
          />
          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3">
            <Stat
              label={t("bestEpoch")}
              value={model.bestEpoch?.toString() ?? tCommon("none")}
            />
            <Stat
              label={tStatus("done")}
              value={
                checkpoints.length > 0
                  ? t("checkpointsSaved", { count: checkpoints.length })
                  : tCommon("none")
              }
            />
          </div>
        </div>
      )}

      {/* Training songs */}
      <div className="surface p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-medium">
          {t("trainingSongs")} ({model.songs.length})
        </h2>
        <ul className="space-y-2 text-sm">
          {model.songs.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 overflow-hidden rounded-md border bg-background/60 px-3 py-2"
            >
              <SongStatusDot status={s.status} />
              <span className="hidden w-20 shrink-0 text-xs text-muted-foreground sm:inline">
                {tryStatus(tStatus, s.status)}
              </span>
              <span
                dir="ltr"
                className="flex-1 truncate font-mono text-xs text-muted-foreground"
              >
                {s.url}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
        <Stat label={tCommon("created")} value={fmtDate(model.createdAt)} />
        <Stat
          label={tCommon("completed")}
          value={fmtDate(model.completedAt) || tCommon("none")}
        />
      </div>
    </div>
  );
}

function tryStatus(t: ReturnType<typeof useTranslations>, key: string) {
  try {
    return t(key as never);
  } catch {
    return key;
  }
}

function SongStatusDot({ status }: { status: string }) {
  const cls =
    status === "isolated" || status === "downloaded"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-muted-foreground/40";
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", cls)} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

// Window over which we measure recent rate for the ETA. Long enough to smooth
// out polling jitter, short enough to track transitions between stages.
const ETA_WINDOW_MS = 90_000;

function TimeStats({
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
  // Live ticking timer for the in-progress case
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

function StageList({
  tStages,
  tStatus,
  status,
  stage,
  message,
}: {
  tStages: ReturnType<typeof useTranslations>;
  tStatus: ReturnType<typeof useTranslations>;
  status: string;
  stage: string | null;
  message: string | null;
}) {
  const isReady = status === "ready";
  const isFailed = status === "failed";
  const currentIdx = STAGE_KEYS.findIndex((k) => k === stage);

  return (
    <ol className="space-y-1.5 text-sm" aria-label={tStatus("running")}>
      {STAGE_KEYS.map((k, i) => {
        const done = isReady || (currentIdx >= 0 && i < currentIdx);
        const current =
          !isReady && !isFailed && currentIdx >= 0 && i === currentIdx;
        const failed = isFailed && i === currentIdx;
        const pending = !done && !current && !failed;
        return (
          <li key={k} className="flex items-center gap-2.5">
            {done && <Check className="h-4 w-4 shrink-0 text-green-500" />}
            {current && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            )}
            {failed && <X className="h-4 w-4 shrink-0 text-destructive" />}
            {pending && (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
            )}
            <span
              className={cn(
                "truncate",
                done && "text-foreground",
                current && "font-medium text-foreground",
                failed && "text-destructive",
                pending && "text-muted-foreground"
              )}
            >
              {tStages(k as never)}
            </span>
            {current && message && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                — {message}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function LogTail({ text, title }: { text: string | null; title: string }) {
  const [open, setOpen] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text, open]);

  if (!text) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        )}
        <Terminal className="h-3.5 w-3.5" />
        {title}
      </button>
      {open && (
        <pre
          ref={preRef}
          dir="ltr"
          className="max-h-64 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
        >
          {text}
        </pre>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="surface space-y-3 p-5">
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-2 animate-pulse rounded bg-muted" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

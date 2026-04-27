"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { Avatar } from "@/components/avatar";
import { StageList } from "@/components/stage-list";
import { LogTail } from "@/components/log-tail";
import { TimeStats } from "@/components/time-stats";
import { cn, fmtDate } from "@/lib/utils";

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
  defaultEpoch: number | null;
  checkpoints: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  songs: Song[];
  _count: { covers: number };
};

const TRAIN_STAGES = [
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
      const body = await res.json().catch(() => ({}));
      toast.error(body.detail || body.error || tModels("deleteFailed"));
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/models/${id}/retry`, { method: "POST" });
      if (res.ok) toast.success(t("retried"));
      else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? t("retryFailed"));
      }
    } finally {
      setRetrying(false);
    }
  }

  async function setDefaultEpoch(epoch: number | null) {
    const prev = model?.defaultEpoch ?? null;
    if (model) setModel({ ...model, defaultEpoch: epoch });
    const res = await fetch(`/api/models/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultEpoch: epoch }),
    });
    if (res.ok) {
      toast.success(t("checkpointSet"));
    } else {
      // revert optimistic update
      if (model) setModel({ ...model, defaultEpoch: prev });
      const body = await res.json().catch(() => ({}));
      toast.error(body.detail ?? body.error ?? t("checkpointFailed"));
    }
  }

  if (!model) return <PageSkeleton />;

  const checkpoints = model.checkpoints
    ? (JSON.parse(model.checkpoints) as { epoch: number; path: string }[])
    : [];
  const isRunning = model.status !== "ready" && model.status !== "failed";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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

      {isRunning && (
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
            stageKeys={TRAIN_STAGES}
            status={model.status}
            stage={model.stage}
            message={model.message}
            failureKeys={["failed"]}
            successKeys={["ready"]}
          />
          <LogTail text={model.logTail} title={t("workerOutput")} />
        </div>
      )}

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
            stageKeys={TRAIN_STAGES}
            status={model.status}
            stage={model.stage}
            message={null}
            failureKeys={["failed"]}
            successKeys={["ready"]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button onClick={retry} disabled={retrying} className="btn btn-primary">
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

      {model.status === "ready" && (
        <>
          <div className="surface space-y-4 p-4 sm:p-5">
            <StageList
              stageKeys={TRAIN_STAGES}
              status={model.status}
              stage={model.stage}
              message={null}
              failureKeys={["failed"]}
              successKeys={["ready"]}
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

          {checkpoints.length > 0 && (
            <CheckpointPicker
              checkpoints={checkpoints}
              bestEpoch={model.bestEpoch}
              defaultEpoch={model.defaultEpoch}
              onPick={setDefaultEpoch}
            />
          )}
        </>
      )}

      <div className="surface p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-medium">
          {t("trainingSongs")} ({model.songs.length})
        </h2>
        <ul className="space-y-2 text-sm">
          {model.songs.map((s) => {
            const effective = effectiveSongStatus(model.status, s.status);
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 overflow-hidden rounded-md border bg-background/60 px-3 py-2"
              >
                <SongStatusDot status={effective} />
                <span
                  dir="ltr"
                  className="flex-1 truncate font-mono text-xs text-muted-foreground"
                >
                  {s.url}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

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

function CheckpointPicker({
  checkpoints,
  bestEpoch,
  defaultEpoch,
  onPick,
}: {
  checkpoints: { epoch: number; path: string }[];
  bestEpoch: number | null;
  defaultEpoch: number | null;
  onPick: (epoch: number | null) => void;
}) {
  const t = useTranslations("model");
  const sorted = [...checkpoints].sort((a, b) => b.epoch - a.epoch);
  const latestEpoch = sorted[0]?.epoch;
  // Active = user-picked default, or best (worker-detected) when none picked.
  const activeEpoch = defaultEpoch ?? bestEpoch ?? null;

  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t("checkpoints")}</h2>
        {defaultEpoch !== null && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("useDefault")}
          </button>
        )}
      </div>
      <p className="hint mb-3">{t("checkpointsHint")}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((c) => {
          const isBest = c.epoch === bestEpoch;
          const isLatest = c.epoch === latestEpoch;
          const isActive = c.epoch === activeEpoch;
          return (
            <li key={c.epoch}>
              <button
                type="button"
                onClick={() => onPick(c.epoch)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border bg-background/60 p-3 text-start transition-colors",
                  isActive
                    ? "border-primary ring-2 ring-primary/30"
                    : "hover:border-foreground/20 hover:bg-secondary/30"
                )}
              >
                <span className="font-mono text-sm font-medium">
                  {t("epochN", { epoch: c.epoch })}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {isBest && <Badge tone="green">{t("badgeBest")}</Badge>}
                  {isLatest && <Badge tone="blue">{t("badgeLatest")}</Badge>}
                  {isActive && (
                    <Badge tone="primary">{t("badgeActive")}</Badge>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "blue" | "primary";
}) {
  const cls = {
    green:
      "bg-green-500/15 text-green-700 dark:text-green-400 ring-green-500/20",
    blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-blue-500/20",
    primary: "bg-primary text-primary-foreground ring-primary",
  }[tone];
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
        cls
      )}
    >
      {children}
    </span>
  );
}

/**
 * Until the worker plumbs per-song status updates back to the DB, every
 * TrainingSong row stays at the default "pending" forever. Derive a sensible
 * effective state from the overall model status so the UI doesn't lie:
 *  - ready  → every song was used to produce that model
 *  - failed → we don't actually know which songs survived isolation; keep
 *             the DB value (typically "pending")
 *  - else   → in-flight; trust whatever the DB says
 */
function effectiveSongStatus(modelStatus: string, songStatus: string): string {
  if (modelStatus === "ready") return "done";
  return songStatus;
}

function SongStatusDot({ status }: { status: string }) {
  const cls =
    status === "isolated" || status === "downloaded" || status === "done"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-muted-foreground/40";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
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

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Download, Loader2, RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { Avatar } from "@/components/avatar";
import { StageList } from "@/components/stage-list";
import { LogTail } from "@/components/log-tail";
import { TimeStats } from "@/components/time-stats";
import { fmtDate } from "@/lib/utils";

type Cover = {
  id: string;
  inputName: string;
  inputUrl: string | null;
  outputPath: string | null;
  status: string;
  stage: string | null;
  progress: number;
  message: string | null;
  error: string | null;
  logTail: string | null;
  pitch: number;
  epoch: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  model: { slug: string; displayName: string; avatarPath: string | null };
};

const COVER_STAGES = [
  "downloading",
  "isolating",
  "converting",
  "mixing",
] as const;

export default function CoverDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations("covers");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const tModel = useTranslations("model");
  const [cover, setCover] = useState<Cover | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    function load() {
      fetch(`/api/covers/${id}`)
        .then((r) => r.json())
        .then((d) => setCover(d.cover ?? null));
    }
    load();
    const handle = setInterval(load, 2000);
    return () => clearInterval(handle);
  }, [id]);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/covers/${id}/retry`, { method: "POST" });
      if (res.ok) toast.success(tModel("retried"));
      else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? tModel("retryFailed"));
      }
    } finally {
      setRetrying(false);
    }
  }

  if (!cover) return <p className="text-muted-foreground">{tCommon("loading")}</p>;
  const outputUrl =
    cover.status === "done" ? `/files/outputs/${cover.id}.wav` : null;
  const isRunning = cover.status !== "done" && cover.status !== "failed";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Avatar
          src={cover.model.avatarPath}
          name={cover.model.displayName}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{cover.inputName}</h1>
          <p className="truncate text-sm text-muted-foreground">
            <Link href="/models" className="underline-offset-2 hover:underline">
              {cover.model.displayName}
            </Link>
            {cover.pitch !== 0 && (
              <> · pitch {cover.pitch > 0 ? "+" : ""}{cover.pitch}</>
            )}
            {cover.epoch && <> · epoch {cover.epoch}</>}
          </p>
        </div>
        <StatusBadge status={cover.status} />
      </div>

      {/* In progress */}
      {isRunning && (
        <div className="surface space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">{t("pipeline")}</h2>
            <span className="tabular-nums text-sm font-medium text-muted-foreground">
              {cover.progress}%
            </span>
          </div>
          <ProgressBar value={cover.progress} />
          <TimeStats
            startedAt={cover.startedAt}
            completedAt={cover.completedAt}
            progress={cover.progress}
            isRunning
          />
          <StageList
            stageKeys={COVER_STAGES}
            status={cover.status}
            stage={cover.stage}
            message={cover.message}
            failureKeys={["failed"]}
            successKeys={["done"]}
          />
          <LogTail text={cover.logTail} title={t("workerOutput")} />
        </div>
      )}

      {/* Failed */}
      {cover.status === "failed" && (
        <div className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-destructive">{t("failedTitle")}</p>
              <p className="mt-1 text-destructive/80">
                {cover.error ?? tCommon("none")}
              </p>
            </div>
          </div>
          <StageList
            stageKeys={COVER_STAGES}
            status={cover.status}
            stage={cover.stage}
            message={null}
            failureKeys={["failed"]}
            successKeys={["done"]}
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
          </div>
          <LogTail text={cover.logTail} title={t("workerOutput")} />
        </div>
      )}

      {/* Done — output player */}
      {outputUrl && (
        <div className="surface space-y-3 p-4 sm:p-5">
          <StageList
            stageKeys={COVER_STAGES}
            status={cover.status}
            stage={cover.stage}
            message={null}
            failureKeys={["failed"]}
            successKeys={["done"]}
          />
          <TimeStats
            startedAt={cover.startedAt}
            completedAt={cover.completedAt}
            progress={100}
            isRunning={false}
          />
          <audio controls src={outputUrl} className="w-full" />
          <a
            href={outputUrl}
            download={`${cover.model.slug}-${cover.inputName.replace(/\.[^.]+$/, "")}.wav`}
            className="btn btn-primary w-full sm:w-auto"
          >
            <Download className="h-4 w-4" />
            {tCommon("download")}
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
        <Stat label={tCommon("created")} value={fmtDate(cover.createdAt)} />
        <Stat
          label={tCommon("completed")}
          value={fmtDate(cover.completedAt) || tCommon("none")}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

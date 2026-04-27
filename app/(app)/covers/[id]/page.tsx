"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, Download } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { Avatar } from "@/components/avatar";
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
  pitch: number;
  epoch: number | null;
  createdAt: string;
  completedAt: string | null;
  model: { slug: string; displayName: string; avatarPath: string | null };
};

export default function CoverDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const t = useTranslations("covers");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [cover, setCover] = useState<Cover | null>(null);

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

  if (!cover) return <p className="text-muted-foreground">{tCommon("loading")}</p>;
  const outputUrl =
    cover.status === "done" ? `/files/outputs/${cover.id}.wav` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Avatar src={cover.model.avatarPath} name={cover.model.displayName} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{cover.inputName}</h1>
          <p className="truncate text-sm text-muted-foreground">
            <Link
              href="/models"
              className="underline-offset-2 hover:underline"
            >
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

      {cover.status !== "done" && cover.status !== "failed" && (
        <div className="surface space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span>
              {cover.stage ? tryT(tStatus, cover.stage) : tStatus("queued")}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {cover.progress}%
            </span>
          </div>
          <ProgressBar value={cover.progress} />
          {cover.message && (
            <p className="hint">{cover.message}</p>
          )}
        </div>
      )}

      {cover.status === "failed" && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">
              {tStatus("failed")}
            </p>
            <p className="mt-1 text-destructive/80">
              {cover.error ?? tCommon("none")}
            </p>
          </div>
        </div>
      )}

      {outputUrl && (
        <div className="surface space-y-3 p-4 sm:p-5">
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

function tryT(t: ReturnType<typeof useTranslations>, k: string) {
  try {
    return t(k as never);
  } catch {
    return k;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

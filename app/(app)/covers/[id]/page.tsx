"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
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
  const [cover, setCover] = useState<Cover | null>(null);

  useEffect(() => {
    function load() {
      fetch(`/api/covers/${id}`)
        .then((r) => r.json())
        .then((d) => setCover(d.cover ?? null));
    }
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [id]);

  if (!cover) return <p className="text-muted-foreground">Loading…</p>;

  const outputUrl = cover.status === "done" ? `/files/outputs/${cover.id}.wav` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        {cover.model.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.model.avatarPath} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary">
            {cover.model.displayName[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-semibold">{cover.inputName}</h1>
          <p className="truncate text-sm text-muted-foreground">
            <Link href={`/models`} className="underline-offset-2 hover:underline">
              {cover.model.displayName}
            </Link>
            {cover.pitch !== 0 && ` · pitch ${cover.pitch > 0 ? "+" : ""}${cover.pitch}`}
            {cover.epoch && ` · epoch ${cover.epoch}`}
          </p>
        </div>
        <StatusBadge status={cover.status} />
      </div>

      {cover.status !== "done" && cover.status !== "failed" && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{cover.stage ?? "queued"}</span>
            <span className="text-muted-foreground">{cover.progress}%</span>
          </div>
          <ProgressBar value={cover.progress} />
          {cover.message && (
            <p className="mt-2 text-xs text-muted-foreground">{cover.message}</p>
          )}
        </div>
      )}

      {cover.status === "failed" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <strong>Failed:</strong> {cover.error ?? "unknown error"}
        </div>
      )}

      {outputUrl && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <audio controls src={outputUrl} className="w-full" />
          <a
            href={outputUrl}
            download={`${cover.model.slug}-${cover.inputName.replace(/\.[^.]+$/, "")}.wav`}
            className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            Download
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <div>Created</div>
          <div>{fmtDate(cover.createdAt)}</div>
        </div>
        <div>
          <div>Completed</div>
          <div>{fmtDate(cover.completedAt)}</div>
        </div>
      </div>
    </div>
  );
}

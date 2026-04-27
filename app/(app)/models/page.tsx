"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Boxes, Plus, Music2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { ProgressBar } from "@/components/progress-bar";
import { fmtRelative } from "@/lib/utils";

type Model = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  progress: number;
  stage: string | null;
  avatarPath: string | null;
  createdAt: string;
  _count: { songs: number; covers: number };
};

export default function ModelsPage() {
  const t = useTranslations("models");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const [models, setModels] = useState<Model[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/models")
        .then((r) => r.json())
        .then((d) => setModels(d.models ?? []));
    }
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Link href="/train" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          {t("createNew")}
        </Link>
      </div>

      {models === null ? (
        <SkeletonGrid />
      ) : models.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t("empty")}
          action={
            <Link href="/train" className="btn btn-primary">
              <Plus className="h-4 w-4" />
              {t("createNew")}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => {
            const stageLabel =
              m.stage && m.stage !== "queued"
                ? tryStage(tStages, m.stage)
                : null;
            return (
              <Link
                key={m.id}
                href={`/models/${m.id}`}
                className="surface group flex flex-col gap-3 p-4 transition-colors hover:border-foreground/20 hover:bg-secondary/30"
              >
                <div className="flex items-center gap-3">
                  <Avatar src={m.avatarPath} name={m.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.displayName}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {m.slug}
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>

                {m.status !== "ready" && m.status !== "failed" && (
                  <div className="space-y-1.5">
                    <ProgressBar value={m.progress} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">
                        {stageLabel ?? tCommon("loading")}
                      </span>
                      <span>{m.progress}%</span>
                    </div>
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Music2 className="h-3.5 w-3.5" />
                    {m._count.songs}
                    <span className="mx-1">·</span>
                    {t("covers", { count: m._count.covers })}
                  </span>
                  <span>{fmtRelative(m.createdAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function tryStage(t: ReturnType<typeof useTranslations>, key: string) {
  try {
    return t(key as never);
  } catch {
    return key;
  }
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="surface space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-2 animate-pulse rounded bg-muted" />
          <div className="border-t pt-3">
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { fmtRelative } from "@/lib/utils";

type Cover = {
  id: string;
  inputName: string;
  status: string;
  progress: number;
  stage: string | null;
  createdAt: string;
  model: { slug: string; displayName: string; avatarPath: string | null };
};

export default function CoversPage() {
  const t = useTranslations("covers");
  const [covers, setCovers] = useState<Cover[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/covers")
        .then((r) => r.json())
        .then((d) => setCovers(d.covers ?? []));
    }
    load();
    const handle = setInterval(load, 4000);
    return () => clearInterval(handle);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {covers === null ? (
        <SkeletonList />
      ) : covers.length === 0 ? (
        <EmptyState icon={History} title={t("empty")} />
      ) : (
        <div className="space-y-2">
          {covers.map((c) => (
            <Link
              key={c.id}
              href={`/covers/${c.id}`}
              className="surface flex items-center gap-3 p-3 transition-colors hover:border-foreground/20 hover:bg-secondary/30 sm:gap-4"
            >
              <Avatar
                src={c.model.avatarPath}
                name={c.model.displayName}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.inputName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.model.displayName} · {fmtRelative(c.createdAt)}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="surface flex items-center gap-3 p-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

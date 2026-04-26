"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
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

  if (models === null) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Models</h1>
        <Link
          href="/train"
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          + Train new
        </Link>
      </div>

      {models.length === 0 ? (
        <p className="text-muted-foreground">No models yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <Link
              key={m.id}
              href={`/models/${m.id}`}
              className="rounded-xl border bg-card p-4 hover:border-foreground/30"
            >
              <div className="flex items-center gap-3">
                {m.avatarPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatarPath}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-lg">
                    {m.displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.slug}</div>
                </div>
                <StatusBadge status={m.status} />
              </div>

              {m.status !== "ready" && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {m.stage ?? ""} {m.progress > 0 ? `· ${m.progress}%` : ""}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{m._count.songs} songs · {m._count.covers} covers</span>
                <span>{fmtRelative(m.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

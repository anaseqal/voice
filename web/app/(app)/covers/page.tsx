"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
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
  const [covers, setCovers] = useState<Cover[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/covers")
        .then((r) => r.json())
        .then((d) => setCovers(d.covers ?? []));
    }
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  if (covers === null) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Cover history</h1>
      {covers.length === 0 ? (
        <p className="text-muted-foreground">No covers yet.</p>
      ) : (
        <div className="space-y-2">
          {covers.map((c) => (
            <Link
              key={c.id}
              href={`/covers/${c.id}`}
              className="flex items-center gap-4 rounded-xl border bg-card p-3 hover:border-foreground/30"
            >
              {c.model.avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.model.avatarPath} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm">
                  {c.model.displayName[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
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

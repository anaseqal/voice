"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { fmtDate } from "@/lib/utils";

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

export default function ModelDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [model, setModel] = useState<Model | null>(null);

  useEffect(() => {
    function load() {
      fetch(`/api/models/${id}`)
        .then((r) => r.json())
        .then((d) => setModel(d.model ?? null));
    }
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [id]);

  async function del() {
    if (!confirm("Delete this model and all its data?")) return;
    const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      router.push("/models");
    } else {
      toast.error("Delete failed");
    }
  }

  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/models/${id}/retry`, { method: "POST" });
      if (res.ok) {
        toast.success("Retrying");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Retry failed");
      }
    } finally {
      setRetrying(false);
    }
  }

  if (!model) return <p className="text-muted-foreground">Loading…</p>;

  const checkpoints = model.checkpoints
    ? (JSON.parse(model.checkpoints) as { epoch: number; path: string }[])
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        {model.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={model.avatarPath} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="grid h-16 w-16 place-items-center rounded-full bg-secondary text-2xl">
            {model.displayName[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{model.displayName}</h1>
          <p className="text-sm text-muted-foreground">{model.slug}</p>
        </div>
        <StatusBadge status={model.status} />
        <button
          onClick={del}
          className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        >
          Delete
        </button>
      </div>

      {model.status !== "ready" && model.status !== "failed" && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{model.stage ?? "queued"}</span>
            <span className="text-muted-foreground">{model.progress}%</span>
          </div>
          <ProgressBar value={model.progress} />
          {model.message && (
            <p className="mt-2 text-xs text-muted-foreground">{model.message}</p>
          )}
          <LogTail text={model.logTail} />
        </div>
      )}

      {model.status === "failed" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="mb-3">
            <strong>Failed:</strong> {model.error ?? "unknown error"}
          </div>
          <button
            onClick={retry}
            disabled={retrying}
            className="rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-sm hover:bg-foreground/5 disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Reuses songs already downloaded on the worker; only re-runs
            isolation onward.
          </p>
        </div>
      )}

      {model.status === "ready" && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p className="mb-2">
            <span className="text-muted-foreground">Best epoch:</span> {model.bestEpoch}
          </p>
          {checkpoints.length > 0 && (
            <p className="text-muted-foreground">
              {checkpoints.length} checkpoints saved (epochs{" "}
              {checkpoints.map((c) => c.epoch).join(", ")})
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">Training songs ({model.songs.length})</h2>
        <ul className="space-y-1 text-sm">
          {model.songs.map((s) => (
            <li key={s.id} className="truncate text-muted-foreground">
              <span className="mr-2 inline-block w-20 text-xs">{s.status}</span>
              {s.url}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <div>Created</div>
          <div>{fmtDate(model.createdAt)}</div>
        </div>
        <div>
          <div>Completed</div>
          <div>{fmtDate(model.completedAt)}</div>
        </div>
      </div>
    </div>
  );
}

function LogTail({ text }: { text: string | null }) {
  const [open, setOpen] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text, open]);

  if (!text) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? "▾" : "▸"} worker output
      </button>
      {open && (
        <pre
          ref={preRef}
          className="mt-2 max-h-64 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
        >
          {text}
        </pre>
      )}
    </div>
  );
}

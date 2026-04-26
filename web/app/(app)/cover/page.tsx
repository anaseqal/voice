"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Model = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  avatarPath: string | null;
};

export default function CoverPage() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [pitch, setPitch] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        const ready = (d.models ?? []).filter((m: Model) => m.status === "ready");
        setModels(ready);
        if (ready[0] && !modelId) setModelId(ready[0].id);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!modelId) return toast.error("Pick a model");
    if (!file && !audioUrl.trim()) return toast.error("Upload an MP3 or paste a URL");

    const fd = new FormData();
    fd.set("modelId", modelId);
    if (file) fd.set("audio", file);
    if (audioUrl.trim()) fd.set("audioUrl", audioUrl.trim());
    fd.set("pitch", String(pitch));

    startTransition(async () => {
      const res = await fetch("/api/covers", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start cover");
        return;
      }
      router.push(`/covers/${data.id}`);
    });
  }

  if (models.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <h1 className="text-2xl font-semibold">No trained models yet</h1>
        <p className="text-muted-foreground">
          Head to <a href="/train" className="underline">Train</a> to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Make a cover</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Upload an MP3 (or paste a URL) — we&apos;ll separate vocals, convert to the chosen
        singer&apos;s voice, and remix.
      </p>

      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6">
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">Singer</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">Audio file (MP3/WAV)</span>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
          />
        </label>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">Audio URL (YouTube or direct link)</span>
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>

        <details className="rounded-md border bg-background/50 p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
          <div className="mt-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Pitch (semitones)</span>
              <input
                type="number"
                value={pitch}
                onChange={(e) => setPitch(parseInt(e.target.value || "0", 10))}
                className="w-full rounded-md border bg-background px-3 py-2"
                min={-12}
                max={12}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Set to ±12 if the source singer&apos;s gender differs.
              </p>
            </label>
          </div>
        </details>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Starting…" : "Make cover"}
        </button>
      </form>
    </div>
  );
}

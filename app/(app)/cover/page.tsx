"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  Link2,
  Loader2,
  Mic2,
  Music,
  Sparkles,
  Upload,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";

type Model = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  avatarPath: string | null;
};

export default function CoverPage() {
  const router = useRouter();
  const t = useTranslations("cover");
  const tCommon = useTranslations("common");
  const tModels = useTranslations("models");
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
        const ready = (d.models ?? []).filter(
          (m: Model) => m.status === "ready"
        );
        setModels(ready);
        if (ready[0] && !modelId) setModelId(ready[0].id);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!modelId) return toast.error(t("model"));
    if (!file && !audioUrl.trim()) return toast.error(t("audioSource"));
    const fd = new FormData();
    fd.set("modelId", modelId);
    if (file) fd.set("audio", file);
    if (audioUrl.trim()) fd.set("audioUrl", audioUrl.trim());
    fd.set("pitch", String(pitch));

    startTransition(async () => {
      const res = await fetch("/api/covers", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("submitFailed"));
        return;
      }
      toast.success(t("submitted"));
      router.push(`/covers/${data.id}`);
    });
  }

  if (models.length === 0) {
    return (
      <EmptyState
        icon={Mic2}
        title={tModels("empty")}
        action={
          <Link href="/train" className="btn btn-primary">
            {tModels("createNew")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form onSubmit={submit} className="surface space-y-5 p-5 sm:p-6">
        {/* Model select */}
        <div className="space-y-1.5">
          <label htmlFor="model" className="label inline-flex items-center gap-1.5">
            <Mic2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t("model")}
          </label>
          <div className="relative">
            <select
              id="model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="input appearance-none pe-10"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.slug})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* File upload */}
        <div className="space-y-1.5">
          <label htmlFor="audio" className="label inline-flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            {t("audioUpload")}
          </label>
          <input
            id="audio"
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-md border bg-background text-sm
                       file:me-3 file:cursor-pointer file:rounded-md file:border-0
                       file:bg-secondary file:px-4 file:py-2 file:text-secondary-foreground
                       hover:file:bg-secondary/80"
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>{tCommon("none") === "—" ? "or" : tCommon("none")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* URL */}
        <div className="space-y-1.5">
          <label htmlFor="audioUrl" className="label inline-flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t("audioUrl")}
          </label>
          <input
            id="audioUrl"
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://..."
            dir="ltr"
            className="input"
          />
        </div>

        {/* Pitch */}
        <div className="space-y-1.5">
          <label htmlFor="pitch" className="label inline-flex items-center gap-1.5">
            <Music className="h-3.5 w-3.5 text-muted-foreground" />
            {t("pitch")}
          </label>
          <input
            id="pitch"
            type="number"
            value={pitch}
            onChange={(e) => setPitch(parseInt(e.target.value || "0", 10))}
            className="input"
            min={-12}
            max={12}
          />
          <p className="hint">{t("pitchHint")}</p>
        </div>

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  Link2,
  Loader2,
  Mic2,
  Music,
  Sparkles,
  Upload,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Model selector — rich avatar cards */}
        <fieldset className="space-y-3">
          <legend className="label inline-flex items-center gap-1.5">
            <Mic2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t("model")}
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                selected={modelId === m.id}
                onSelect={() => setModelId(m.id)}
              />
            ))}
          </div>
        </fieldset>

        <div className="surface space-y-5 p-5 sm:p-6">
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
            {file && (
              <p className="hint truncate" dir="ltr">
                {file.name}
              </p>
            )}
          </div>

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

          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary w-full"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {pending ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModelCard({
  model,
  selected,
  onSelect,
}: {
  model: Model;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-all",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "hover:border-foreground/20 hover:bg-secondary/30"
      )}
    >
      <input
        type="radio"
        name="model"
        value={model.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <Avatar src={model.avatarPath} name={model.displayName} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{model.displayName}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {model.slug}
        </div>
      </div>
      {selected && (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </label>
  );
}

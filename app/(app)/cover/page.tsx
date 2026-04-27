"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  FileAudio,
  Link2,
  Loader2,
  Mic,
  Mic2,
  Music,
  Settings2,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/avatar";
import { MicRecorder } from "@/components/mic-recorder";
import { cn, fmtDuration } from "@/lib/utils";

type Model = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  avatarPath: string | null;
};

type SourceTab = "record" | "upload" | "url";

export default function CoverPage() {
  const router = useRouter();
  const t = useTranslations("cover");
  const tCommon = useTranslations("common");
  const tModels = useTranslations("models");
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState("");
  const [source, setSource] = useState<SourceTab>("record");
  const [file, setFile] = useState<File | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [pitch, setPitch] = useState(0);
  const [indexRate, setIndexRate] = useState(0.65);
  const [protect, setProtect] = useState(0.5);
  const [skipIsolation, setSkipIsolation] = useState(false);
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

  function handleRecorded(blob: File, durationSec: number) {
    setFile(blob);
    setRecordingDuration(durationSec);
    setAudioUrl("");
  }

  function handleUploaded(f: File | null) {
    setFile(f);
    setRecordingDuration(null);
  }

  function clearAudio() {
    setFile(null);
    setRecordingDuration(null);
    setAudioUrl("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!modelId) return toast.error(t("model"));
    if (!file && !audioUrl.trim()) return toast.error(t("audioSource"));
    const fd = new FormData();
    fd.set("modelId", modelId);
    if (file) fd.set("audio", file);
    if (audioUrl.trim()) fd.set("audioUrl", audioUrl.trim());
    fd.set("pitch", String(pitch));
    fd.set("indexRate", String(indexRate));
    fd.set("protect", String(protect));
    if (skipIsolation) fd.set("skipIsolation", "on");

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

        {/* Audio source — segmented tabs + tab body */}
        <fieldset className="space-y-3">
          <legend className="label">{t("audioSource")}</legend>
          <div
            role="tablist"
            className="inline-flex w-full overflow-hidden rounded-md border bg-background p-0.5 sm:w-auto"
          >
            <SourceTabBtn
              icon={Mic}
              label={t("audioRecord")}
              active={source === "record"}
              onClick={() => {
                setSource("record");
                clearAudio();
              }}
            />
            <SourceTabBtn
              icon={Upload}
              label={t("audioUpload")}
              active={source === "upload"}
              onClick={() => {
                setSource("upload");
                clearAudio();
              }}
            />
            <SourceTabBtn
              icon={Link2}
              label={t("audioUrlTab")}
              active={source === "url"}
              onClick={() => {
                setSource("url");
                clearAudio();
              }}
            />
          </div>

          {/* Tab body */}
          {source === "record" && (
            <>
              {file && recordingDuration !== null ? (
                <RecordedBadge
                  durationSec={recordingDuration}
                  onClear={clearAudio}
                />
              ) : (
                <MicRecorder onUse={handleRecorded} />
              )}
            </>
          )}

          {source === "upload" && (
            <div className="surface space-y-2 p-4 sm:p-5">
              <input
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(e) => handleUploaded(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-md border bg-background text-sm
                           file:me-3 file:cursor-pointer file:rounded-md file:border-0
                           file:bg-secondary file:px-4 file:py-2 file:text-secondary-foreground
                           hover:file:bg-secondary/80"
              />
              {file && recordingDuration === null && (
                <p className="hint inline-flex items-center gap-1.5" dir="ltr">
                  <FileAudio className="h-3.5 w-3.5" />
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
          )}

          {source === "url" && (
            <div className="surface p-4 sm:p-5">
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
          )}
        </fieldset>

        {/* Pitch */}
        <div className="surface space-y-1.5 p-4 sm:p-5">
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

        {/* Advanced */}
        <details className="group rounded-xl border bg-card text-card-foreground">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              {t("advanced")}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-5 border-t p-4 sm:p-5">
            <p className="hint">{t("advancedHint")}</p>

            <Slider
              label={t("indexRate")}
              hint={t("indexRateHint")}
              value={indexRate}
              min={0}
              max={1}
              step={0.05}
              onChange={setIndexRate}
              icon={Sliders}
            />

            <Slider
              label={t("protect")}
              hint={t("protectHint")}
              value={protect}
              min={0}
              max={0.5}
              step={0.01}
              onChange={setProtect}
              icon={Sliders}
            />

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={skipIsolation}
                onChange={(e) => setSkipIsolation(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input bg-background text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  {t("skipIsolation")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("skipIsolationHint")}
                </span>
              </span>
            </label>
          </div>
        </details>

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

function SourceTabBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Mic;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-3 py-1.5 text-sm transition-colors sm:flex-initial",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function RecordedBadge({
  durationSec,
  onClear,
}: {
  durationSec: number;
  onClear: () => void;
}) {
  const t = useTranslations("recorder");
  return (
    <div className="surface flex items-center gap-3 p-3 sm:p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
        <Check className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("preview")}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {fmtDuration(durationSec)}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="btn btn-outline border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        {t("retake")}
      </button>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  icon: Icon,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  icon?: typeof Sliders;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="label inline-flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
      {hint && <p className="hint">{hint}</p>}
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

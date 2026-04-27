"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  GraduationCap,
  ImagePlus,
  Loader2,
  ListMusic,
  Settings2,
  Tag,
  User,
} from "lucide-react";
import { slugify } from "@/lib/utils";

export default function TrainPage() {
  const router = useRouter();
  const t = useTranslations("train");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [songUrls, setSongUrls] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [epochMode, setEpochMode] = useState<"auto" | "set">("auto");
  const [epochValue, setEpochValue] = useState<number>(500);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const urls = songUrls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length < 1) return toast.error(t("submitFailed"));

    const fd = new FormData(e.currentTarget as HTMLFormElement);
    fd.set("displayName", displayName);
    fd.set("slug", slug || slugify(displayName));
    fd.set("songUrls", urls.join("\n"));
    if (avatar) fd.set("avatar", avatar);
    if (epochMode === "set") fd.set("totalEpoch", String(epochValue));
    else fd.delete("totalEpoch");

    startTransition(async () => {
      const res = await fetch("/api/models", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("submitFailed"));
        return;
      }
      toast.success(t("submitted"));
      router.push(`/models/${data.id}`);
    });
  }

  const songCount = songUrls
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form onSubmit={submit} className="surface space-y-5 p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="displayName"
            label={t("displayName")}
            icon={User}
            input={
              <input
                id="displayName"
                required
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (!slug) setSlug(slugify(e.target.value));
                }}
                placeholder={t("displayNamePlaceholder")}
                className="input ps-9"
              />
            }
          />

          <Field
            id="slug"
            label={t("slug")}
            hint={t("slugHint")}
            icon={Tag}
            input={
              <input
                id="slug"
                required
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder={t("slugPlaceholder")}
                dir="ltr"
                className="input ps-9 font-mono text-sm"
              />
            }
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="avatar" className="label inline-flex items-center gap-1.5">
            <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
            {t("avatar")}
          </label>
          <input
            id="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-md border bg-background text-sm
                       file:me-3 file:cursor-pointer file:rounded-md file:border-0
                       file:bg-secondary file:px-4 file:py-2 file:text-secondary-foreground
                       hover:file:bg-secondary/80"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="songUrls" className="label inline-flex items-center gap-1.5">
              <ListMusic className="h-3.5 w-3.5 text-muted-foreground" />
              {t("songUrls")}
            </label>
            <span className="hint tabular-nums">{songCount}</span>
          </div>
          <textarea
            id="songUrls"
            required
            value={songUrls}
            onChange={(e) => setSongUrls(e.target.value)}
            rows={8}
            dir="ltr"
            placeholder={"https://youtube.com/watch?v=...\nhttps://example.com/song.mp3"}
            className="input min-h-[10rem] resize-y py-2 font-mono text-xs"
          />
          <p className="hint">{t("songUrlsHint")}</p>
        </div>

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

            <div className="space-y-1.5">
              <label htmlFor="totalEpochMode" className="label">
                {t("totalEpoch")}
              </label>
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <div className="relative">
                  <select
                    id="totalEpochMode"
                    value={epochMode}
                    onChange={(e) =>
                      setEpochMode(e.target.value as "auto" | "set")
                    }
                    className="input appearance-none pe-9"
                  >
                    <option value="auto">{t("totalEpochAuto")}</option>
                    <option value="set">{t("totalEpochSet")}</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {epochMode === "set" && (
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    step={25}
                    value={epochValue}
                    onChange={(e) =>
                      setEpochValue(parseInt(e.target.value || "0", 10) || 0)
                    }
                    className="input"
                    dir="ltr"
                  />
                )}
              </div>
              <p className="hint">{t("totalEpochHint")}</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="vocoder" className="label">
                {t("vocoder")}
              </label>
              <div className="relative">
                <select
                  id="vocoder"
                  name="vocoder"
                  defaultValue=""
                  className="input appearance-none pe-10"
                >
                  <option value="">—</option>
                  <option value="RefineGAN">RefineGAN</option>
                  <option value="HiFi-GAN">HiFi-GAN</option>
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="hint">{t("vocoderHint")}</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cutPreprocess" className="label">
                {t("cutPreprocess")}
              </label>
              <div className="relative">
                <select
                  id="cutPreprocess"
                  name="cutPreprocess"
                  defaultValue=""
                  className="input appearance-none pe-10"
                >
                  <option value="">—</option>
                  <option value="Skip">Skip</option>
                  <option value="Simple">Simple</option>
                  <option value="Automatic">Automatic</option>
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="hint">{t("cutPreprocessHint")}</p>
            </div>

            <Toggle
              name="twoPassIsolation"
              label={t("twoPassIsolation")}
              hint={t("twoPassIsolationHint")}
            />

            <Toggle
              name="trimSilence"
              label={t("trimSilence")}
              hint={t("trimSilenceHint")}
            />
          </div>
        </details>

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GraduationCap className="h-4 w-4" />
          )}
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
    </div>
  );
}

function Toggle({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input bg-background text-primary focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  hint,
  icon: Icon,
  input,
}: {
  id: string;
  label: string;
  hint?: string;
  icon?: typeof User;
  input: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        {input}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { slugify } from "@/lib/utils";

export default function TrainPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [songUrls, setSongUrls] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const urls = songUrls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length < 1) return toast.error("Add at least one song URL");

    const fd = new FormData();
    fd.set("displayName", displayName);
    fd.set("slug", slug || slugify(displayName));
    fd.set("songUrls", urls.join("\n"));
    if (avatar) fd.set("avatar", avatar);

    startTransition(async () => {
      const res = await fetch("/api/models", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start training");
        return;
      }
      toast.success("Training started");
      router.push(`/models/${data.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Train a singer</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Paste 8–20 song URLs (YouTube or direct MP3 links). We&apos;ll isolate vocals and
        train an RVC model. Takes ~30–60 minutes per training run.
      </p>

      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Display name</span>
            <input
              required
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
              placeholder="Rashid Al Majidi"
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Slug</span>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="rashid"
              pattern="[a-z0-9][-a-z0-9_]{1,40}"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Lowercase, used in URLs and worker filenames.
            </p>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Avatar (optional)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">
            Song URLs (one per line)
          </span>
          <textarea
            required
            value={songUrls}
            onChange={(e) => setSongUrls(e.target.value)}
            rows={10}
            placeholder={"https://youtube.com/watch?v=...\nhttps://example.com/song.mp3"}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            8–20 songs recommended. Solo vocals, minimal autotune, no duets.
          </p>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Start training"}
        </button>
      </form>
    </div>
  );
}

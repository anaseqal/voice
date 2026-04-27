"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, LogIn, Lock, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("login");
  const tApp = useTranslations("app");
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? t("invalid"));
        return;
      }
      router.replace(params.get("next") ?? "/cover");
    });
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex items-center justify-end gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <form onSubmit={submit} className="surface space-y-5 p-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tApp("name")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="username" className="label">
            {t("username")}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="username"
              type="text"
              autoComplete="username"
              className="input ps-9"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              dir="ltr"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="label">
            {t("password")}
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input ps-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
            />
          </div>
        </div>

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("submitting")}
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              {t("submit")}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

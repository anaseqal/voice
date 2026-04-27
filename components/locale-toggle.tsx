"use client";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/lib/locale";

const LABEL: Record<Locale, string> = {
  en: "EN",
  ar: "ع",
};

export function LocaleToggle() {
  const current = useLocale() as Locale;
  const t = useTranslations("nav");
  const [pending, startTransition] = useTransition();

  function setLocale(next: Locale) {
    if (next === current) return;
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      // Hard reload so the server layout re-reads the cookie and switches dir/lang.
      window.location.reload();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex items-center rounded-md border bg-background p-0.5"
    >
      <span className="px-1.5 text-muted-foreground">
        <Languages className="h-3.5 w-3.5" />
      </span>
      {LOCALES.map((loc) => {
        const active = current === loc;
        return (
          <button
            key={loc}
            type="button"
            disabled={pending}
            onClick={() => setLocale(loc)}
            className={cn(
              "h-7 min-w-[28px] rounded-[4px] px-2 text-xs font-medium transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {LABEL[loc]}
          </button>
        );
      })}
    </div>
  );
}

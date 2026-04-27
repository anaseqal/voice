"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS: { key: "light" | "dark" | "system"; icon: typeof Sun }[] = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "system", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="group"
      aria-label={t("theme")}
      className="inline-flex items-center rounded-md border bg-background p-0.5"
    >
      {OPTIONS.map(({ key, icon: Icon }) => {
        const active = mounted && theme === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTheme(key)}
            aria-label={t(
              key === "light"
                ? "themeLight"
                : key === "dark"
                  ? "themeDark"
                  : "themeSystem"
            )}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

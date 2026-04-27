"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mic2, History, Boxes, GraduationCap, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { LocaleToggle } from "./locale-toggle";

const TABS: {
  href: string;
  key: "cover" | "train" | "models" | "history";
  icon: typeof Mic2;
}[] = [
  { href: "/cover", key: "cover", icon: Mic2 },
  { href: "/train", key: "train", icon: GraduationCap },
  { href: "/models", key: "models", icon: Boxes },
  { href: "/covers", key: "history", icon: History },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const tApp = useTranslations("app");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/cover"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Mic2 className="h-3.5 w-3.5" />
            </span>
            <span className="hidden sm:inline">{tApp("name")}</span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {TABS.map(({ href, key, icon: Icon }) => {
              const active =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t(key)}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
          <button
            onClick={logout}
            aria-label={t("signOut")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("signOut")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

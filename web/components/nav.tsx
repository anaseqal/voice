"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/cover", label: "Cover" },
  { href: "/train", label: "Train" },
  { href: "/models", label: "Models" },
  { href: "/covers", label: "History" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/cover" className="font-semibold tracking-tight">
            voice.ihub2
          </Link>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => {
              const active = pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          onClick={logout}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

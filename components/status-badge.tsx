"use client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  ready: "bg-green-500/10 text-green-600 dark:text-green-400 ring-green-500/20",
  done: "bg-green-500/10 text-green-600 dark:text-green-400 ring-green-500/20",
  training: "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20",
  running: "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20",
  queued: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
};
const DOT: Record<string, string> = {
  ready: "bg-green-500",
  done: "bg-green-500",
  training: "bg-blue-500 animate-pulse",
  running: "bg-blue-500 animate-pulse",
  queued: "bg-amber-500",
  failed: "bg-red-500",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = useTranslations("status");
  const label = (() => {
    try {
      return t(status as never);
    } catch {
      return status;
    }
  })();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[status] ?? "bg-muted text-muted-foreground ring-border",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status] ?? "bg-muted-foreground")} />
      {label}
    </span>
  );
}

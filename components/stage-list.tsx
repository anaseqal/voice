"use client";
import { useTranslations } from "next-intl";
import { Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function StageList({
  stageKeys,
  status,
  stage,
  message,
  failureKeys = ["failed"],
  successKeys = ["ready", "done"],
}: {
  /** Ordered pipeline stage keys, must exist as `stages.<key>` translations. */
  stageKeys: readonly string[];
  /** Job-level status (e.g. "training" / "ready" / "failed"). */
  status: string;
  /** Currently-active stage from the worker callback, or null when queued. */
  stage: string | null;
  /** Live message for the active stage (e.g. "epoch 175/350"). */
  message: string | null;
  /** Status values that mean "every stage is failed at the current one". */
  failureKeys?: readonly string[];
  /** Status values that mean "every stage is done." */
  successKeys?: readonly string[];
}) {
  const t = useTranslations("stages");
  const isReady = successKeys.includes(status);
  const isFailed = failureKeys.includes(status);
  const currentIdx = stageKeys.findIndex((k) => k === stage);

  return (
    <ol className="space-y-1.5 text-sm">
      {stageKeys.map((k, i) => {
        const done = isReady || (currentIdx >= 0 && i < currentIdx);
        const current =
          !isReady && !isFailed && currentIdx >= 0 && i === currentIdx;
        const failed = isFailed && i === currentIdx;
        const pending = !done && !current && !failed;
        return (
          <li key={k} className="flex items-center gap-2.5">
            {done && <Check className="h-4 w-4 shrink-0 text-green-500" />}
            {current && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            )}
            {failed && <X className="h-4 w-4 shrink-0 text-destructive" />}
            {pending && (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
            )}
            <span
              className={cn(
                "truncate",
                done && "text-foreground",
                current && "font-medium text-foreground",
                failed && "text-destructive",
                pending && "text-muted-foreground"
              )}
            >
              {tryT(t, k)}
            </span>
            {current && message && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                — {message}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function tryT(t: ReturnType<typeof useTranslations>, k: string) {
  try {
    return t(k as never);
  } catch {
    return k;
  }
}

import { cn, statusColor } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", statusColor(status))} />
      {status}
    </span>
  );
}

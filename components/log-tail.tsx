"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";

export function LogTail({
  text,
  title,
  defaultOpen = true,
}: {
  text: string | null;
  title: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (open && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [text, open]);

  if (!text) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        )}
        <Terminal className="h-3.5 w-3.5" />
        {title}
      </button>
      {open && (
        <pre
          ref={preRef}
          dir="ltr"
          className="max-h-64 overflow-auto rounded-md border bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
        >
          {text}
        </pre>
      )}
    </div>
  );
}

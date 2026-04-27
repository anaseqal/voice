import { cn } from "@/lib/utils";

export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const px = `${size}px`;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        style={{ width: px, height: px }}
        className={cn(
          "shrink-0 rounded-full bg-muted object-cover ring-1 ring-border",
          className
        )}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "•";
  return (
    <div
      style={{ width: px, height: px }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground ring-1 ring-border",
        className
      )}
    >
      <span className="font-medium" style={{ fontSize: size * 0.4 }}>
        {initial}
      </span>
    </div>
  );
}

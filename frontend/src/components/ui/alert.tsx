import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-ink-faint bg-surface-card p-4 text-[13px] text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}

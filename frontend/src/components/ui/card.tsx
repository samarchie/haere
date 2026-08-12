import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type CardState = "resting" | "expanded";

const STATE_CLASSES: Record<CardState, string> = {
  resting: "border border-kotare-grey",
  expanded: "border border-kotare-blue",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  state?: CardState;
}

export function Card({ state = "resting", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-card p-4 shadow-sm transition-colors duration-200",
        STATE_CLASSES[state],
        className,
      )}
      {...props}
    />
  );
}

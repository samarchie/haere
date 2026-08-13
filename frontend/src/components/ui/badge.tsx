import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "blue" | "teal" | "brown" | "grey";

const TONE_CLASSES: Record<BadgeTone, string> = {
  blue: "bg-kotare-blue text-white",
  teal: "bg-kotare-teal text-white",
  brown: "bg-kotare-brown text-white",
  grey: "bg-kotare-grey text-ink",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
}

export function Badge({ tone, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

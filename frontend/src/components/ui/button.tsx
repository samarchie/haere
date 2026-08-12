import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "outline" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-kotare-navy text-white shadow-md shadow-kotare-navy/25 hover:bg-kotare-blue disabled:bg-kotare-grey disabled:text-ink-faint disabled:shadow-none",
  outline:
    "border-2 border-kotare-blue text-kotare-blue hover:bg-kotare-blue/[0.06] disabled:border-kotare-grey disabled:text-ink-faint",
  ghost: "text-kotare-blue hover:text-kotare-navy",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "sd-focus inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg text-[13.5px] font-bold transition-colors duration-150 disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

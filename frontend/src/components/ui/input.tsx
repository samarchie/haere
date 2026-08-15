import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "sd-focus w-full h-11 rounded-lg border border-kotare-grey px-3 text-[13.5px] font-medium placeholder:text-ink-faint placeholder:font-normal",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

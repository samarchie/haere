import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "../../lib/cn";

export interface ToggleGroupOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ToggleGroupProps {
  options: ToggleGroupOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  "aria-label": string;
}

export function ToggleGroup({
  options,
  value,
  onValueChange,
  ...props
}: ToggleGroupProps) {
  return (
    <RadixToggleGroup.Root
      type="single"
      value={value ?? undefined}
      onValueChange={(next) => {
        // Radix reserves "" internally to mean "nothing selected", so a
        // single-select group can never land on an item whose own value is
        // "" — callers needing an "all" option must give it a real value.
        // Deselect events (next === "") are the item-already-on click and
        // are ignored: this group always has exactly one active option.
        if (next) onValueChange(next);
      }}
      className="inline-flex rounded-md border border-kotare-grey bg-kotare-grey/10 p-0.5"
      {...props}
    >
      {options.map((option) => (
        <RadixToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "sd-focus px-3 py-1.5 rounded-[6px] text-xs font-medium text-ink-soft transition-colors duration-150",
            "data-[state=on]:bg-kotare-navy data-[state=on]:text-white data-[state=on]:font-semibold",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {option.label}
        </RadixToggleGroup.Item>
      ))}
    </RadixToggleGroup.Root>
  );
}

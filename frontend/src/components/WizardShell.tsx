import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface WizardShellProps {
  step: 1 | 2 | 3;
  title: string;
  children: ReactNode;
}

const TOTAL_STEPS = 3;
const STEP_KEYS = ["step-1", "step-2", "step-3"] as const;

export function WizardShell({ step, title, children }: WizardShellProps) {
  return (
    <div className="mx-auto w-full max-w-[460px] rounded-xl border border-kotare-grey bg-surface-card p-5 shadow-sm">
      <div data-testid="wizard-progress" className="flex gap-1.5 mb-3">
        {STEP_KEYS.map((key, i) => (
          <div
            key={key}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < step ? "bg-kotare-navy" : "bg-kotare-grey",
            )}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] text-kotare-blue font-semibold">
        Step {step} of {TOTAL_STEPS}
      </span>
      <h2 className="text-[16px] font-bold tracking-tight text-ink mt-0.5 mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

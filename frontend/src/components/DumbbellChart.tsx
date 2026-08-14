import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

export type DumbbellTone = "better" | "worse" | "none";

export interface DumbbellChartProps {
  todayMinutes: number;
  afterMinutes: number;
  axisMaxMinutes: number;
  tone: DumbbellTone;
  staggerIndex: number;
}

const TONE_DOT_CLASS: Record<DumbbellTone, string> = {
  better: "bg-kotare-teal",
  worse: "bg-kotare-brown",
  none: "bg-kotare-grey",
};

const TONE_CONNECTOR_CLASS: Record<DumbbellTone, string> = {
  better: "bg-kotare-teal/70",
  worse: "bg-kotare-brown/70",
  none: "bg-kotare-grey/70",
};

function clampPct(minutes: number, axisMaxMinutes: number): number {
  return Math.min(100, Math.max(0, (minutes / axisMaxMinutes) * 100));
}

function dotPosition(pct: number): string {
  return `calc(${pct}% - 5px)`;
}

export function DumbbellChart({
  todayMinutes,
  afterMinutes,
  axisMaxMinutes,
  tone,
  staggerIndex,
}: DumbbellChartProps) {
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimateIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const todayPct = clampPct(todayMinutes, axisMaxMinutes);
  const afterPct = clampPct(afterMinutes, axisMaxMinutes);
  // Track the after-dot's animated position (not its final one) so the
  // connector bar grows in sync with the dot instead of jumping ahead of it.
  const effectiveAfterPct = animateIn ? afterPct : todayPct;

  const todayLeft = dotPosition(todayPct);
  const afterLeft = dotPosition(afterPct);
  const connectorLeft = `${Math.min(todayPct, effectiveAfterPct)}%`;
  const connectorWidth = `${Math.abs(effectiveAfterPct - todayPct)}%`;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-ink-faint">0</span>
      <div className="relative h-4 flex-1">
        <div className="absolute top-1/2 -translate-y-1/2 h-2 w-full rounded-full bg-kotare-grey/40" />
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-[2px] transition-[left,width] duration-[900ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
            TONE_CONNECTOR_CLASS[tone],
          )}
          style={{
            left: connectorLeft,
            width: connectorWidth,
            transitionDelay: `${300 + staggerIndex * 200}ms`,
          }}
        />
        <span
          data-testid="dumbbell-today-dot"
          className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-white border-2 border-ink-faint"
          style={{ left: todayLeft }}
        />
        <span
          data-testid="dumbbell-after-dot"
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full transition-[left] duration-[900ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
            TONE_DOT_CLASS[tone],
          )}
          style={{
            left: animateIn ? afterLeft : todayLeft,
            transitionDelay: `${300 + staggerIndex * 200}ms`,
          }}
        />
      </div>
      <span className="font-mono text-[10px] text-ink-faint">
        {axisMaxMinutes} min
      </span>
    </div>
  );
}

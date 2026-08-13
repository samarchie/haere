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

function dotPosition(minutes: number, axisMaxMinutes: number): string {
  const pct = Math.min(100, Math.max(0, (minutes / axisMaxMinutes) * 100));
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

  const todayLeft = dotPosition(todayMinutes, axisMaxMinutes);
  const afterLeft = dotPosition(afterMinutes, axisMaxMinutes);
  const connectorLeft = todayMinutes <= afterMinutes ? todayLeft : afterLeft;
  const connectorWidth = `${Math.abs(
    Math.min(100, Math.max(0, (afterMinutes / axisMaxMinutes) * 100)) -
      Math.min(100, Math.max(0, (todayMinutes / axisMaxMinutes) * 100)),
  )}%`;

  return (
    <div>
      <div className="relative h-4">
        <div className="absolute top-1/2 -translate-y-1/2 h-2 w-full rounded-full bg-kotare-grey/40" />
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-[2px]",
            TONE_CONNECTOR_CLASS[tone],
          )}
          style={{ left: connectorLeft, width: connectorWidth }}
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
            ["--dumbbell-to" as string]: afterLeft,
          }}
        />
      </div>
      <div className="relative h-3 mt-0.5">
        <span className="font-mono text-[10px] text-ink-faint absolute left-0">
          0
        </span>
        <span className="font-mono text-[10px] text-ink-faint absolute right-0">
          {axisMaxMinutes} min
        </span>
      </div>
    </div>
  );
}

import networkData from "../data/chch-network.json";

interface NetworkPoint {
  x: number;
  y: number;
  kind: "plain" | "stop" | "hub";
}

interface NetworkRoute {
  name: string;
  pts: NetworkPoint[];
}

const ROUTES = networkData as NetworkRoute[];
const VIEWBOX_W = 1000;
const VIEWBOX_H = 640;

function pathData(pts: NetworkPoint[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function segmentLength(a: NetworkPoint, b: NetworkPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ponytail: a bus "dwelling" at a stop/hub is simulated with uneven
// keyTimes on a single <animateMotion>, not a hand-rolled timeline engine —
// native SVG motion path covers the same visual beat (pause, then move on)
// for a fraction of the code a custom easing/dwell calculator would need.
function buildMotionTiming(pts: NetworkPoint[]): {
  keyPoints: string;
  keyTimes: string;
} {
  const cumulative: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + segmentLength(pts[i - 1], pts[i]));
  }
  const total = cumulative[cumulative.length - 1] || 1;

  const keyPoints: number[] = [0];
  const elapsed: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    let step = 1;
    if (pts[i].kind === "stop") step += 3;
    else if (pts[i].kind === "hub") step += 1.5;
    keyPoints.push(cumulative[i] / total);
    elapsed.push(elapsed[i - 1] + step);
  }
  const totalElapsed = elapsed[elapsed.length - 1] || 1;

  return {
    keyPoints: keyPoints.map((p) => p.toFixed(4)).join(";"),
    keyTimes: elapsed.map((t) => (t / totalElapsed).toFixed(4)).join(";"),
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function NetworkBackdrop() {
  const reduceMotion = prefersReducedMotion();

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {ROUTES.map((route) => {
        const timing = reduceMotion ? null : buildMotionTiming(route.pts);
        return (
          <g key={route.name}>
            <path
              id={`route-${route.name}`}
              d={pathData(route.pts)}
              fill="none"
              stroke="#287DAB"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.12}
            />
            {timing && (
              <circle r={3} fill="#214d65">
                <animateMotion
                  dur={`${18 + (route.pts.length % 7) * 2}s`}
                  repeatCount="indefinite"
                  keyPoints={timing.keyPoints}
                  keyTimes={timing.keyTimes}
                  calcMode="linear"
                >
                  <mpath href={`#route-${route.name}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

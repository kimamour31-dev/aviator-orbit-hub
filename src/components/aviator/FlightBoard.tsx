import planeImg from "@/assets/red-plane.png";
import { CRASHED_MS, WAITING_MS, formatMult, msForMultiplier } from "@/lib/aviator";
import type { Phase } from "@/hooks/use-aviator-game";
import { cn } from "@/lib/utils";

type Props = {
  phase: Phase;
  elapsed: number;
  multiplier: number;
  round: number;
};

const W = 1000;
const H = 500;

export function FlightBoard({ phase, elapsed, multiplier, round }: Props) {
  const flightMs = phase === "flying" ? elapsed : phase === "crashed" ? msForMultiplier(multiplier) : 0;
  const tMax = Math.max(8000, flightMs * 1.15);
  const mMax = Math.max(2, 1 + (multiplier - 1) * 1.25);

  const toXY = (ms: number, m: number) => {
    const x = (ms / tMax) * W;
    const y = H - ((m - 1) / (mMax - 1)) * H * 0.85;
    return [x, y] as const;
  };

  const steps = 60;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (flightMs * i) / steps;
    const m = Math.exp(Math.log(Math.max(1, multiplier)) * (flightMs === 0 ? 0 : t / flightMs));
    const [x, y] = toXY(t, m);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const [tipX, tipY] = toXY(flightMs, multiplier);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `${linePath} L ${tipX.toFixed(1)},${H} L 0,${H} Z`;

  const waitingLeft = Math.max(0, WAITING_MS - elapsed);
  const crashedProgress = Math.min(1, elapsed / CRASHED_MS);

  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round(((tMax / 1000) * i) / 4));
  const yTicks = Array.from({ length: 5 }, (_, i) => 1 + ((mMax - 1) * (i + 1)) / 5);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs">
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-medium text-muted-foreground">
          Round <span className="font-mono text-foreground">#{String(round).padStart(5, "0")}</span>
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-muted-foreground">
          Real mode
        </span>
      </div>

      <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
        <div className="sky-rays pointer-events-none absolute inset-0 opacity-60" />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="trail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {yTicks.map((_, i) => (
            <line key={i} x1="0" x2={W} y1={(H / 5) * i} y2={(H / 5) * i} stroke="var(--border)" strokeWidth="1" />
          ))}
          {phase !== "waiting" && (
            <>
              <path d={areaPath} fill="url(#trail)" />
              <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>

        {/* Axis labels */}
        <div className="pointer-events-none absolute inset-y-0 left-2 flex flex-col-reverse justify-between py-3 text-[10px] text-muted-foreground">
          {yTicks.map((v, i) => (
            <span key={i}>{v.toFixed(1)}x</span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-8 bottom-1 flex justify-between text-[10px] text-muted-foreground">
          {xTicks.map((v, i) => (
            <span key={i}>{v}s</span>
          ))}
        </div>

        {/* Plane */}
        {phase !== "waiting" && (
          <img
            src={planeImg}
            alt=""
            width={1024}
            height={640}
            className={cn(
              "pointer-events-none absolute w-[18%] min-w-20 max-w-44 drop-shadow-[0_8px_18px_var(--primary-glow)]",
              phase === "crashed" && "plane-away",
            )}
            style={{
              left: `${(tipX / W) * 100}%`,
              top: `${(tipY / H) * 100}%`,
              transform: "translate(-30%, -75%) rotate(-12deg)",
            }}
          />
        )}

        {/* Center readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
          {phase === "waiting" && (
            <>
              <img
                src={planeImg}
                alt=""
                width={1024}
                height={640}
                className="plane-idle w-40 drop-shadow-[0_8px_18px_var(--primary-glow)] sm:w-56"
              />
              <p className="font-display text-lg font-bold uppercase tracking-[0.2em] text-foreground sm:text-xl">
                Waiting for next round
              </p>
              <div className="h-1.5 w-56 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(waitingLeft / WAITING_MS) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Takeoff in {(waitingLeft / 1000).toFixed(1)}s · place your bets</p>
            </>
          )}
          {phase === "flying" && (
            <>
              <p className="font-display text-6xl font-extrabold tabular-nums text-foreground sm:text-8xl">
                {formatMult(multiplier)}
              </p>
              <span className="rounded-full border border-primary/60 bg-primary/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Plane in flight
              </span>
            </>
          )}
          {phase === "crashed" && (
            <>
              <p className="font-display text-xl font-bold uppercase tracking-[0.25em] text-primary">Flew away!</p>
              <p className="font-display text-6xl font-extrabold tabular-nums text-primary sm:text-8xl">
                {formatMult(multiplier)}
              </p>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary/70" style={{ width: `${(1 - crashedProgress) * 100}%` }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

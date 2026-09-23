import type { RenderTool } from "./render-model.js";

/**
 * A real, sourced dollar figure at one monthly data volume. At least two points make up a
 * `"volume"` basis, so a cost can be interpolated between them rather than asserted as one flat
 * number or a single invented formula — real pricing has genuine tier breaks (S3's per-GB rate
 * stepping down past 50TB, for instance), and checkpoints stay honest about the gap between what
 * is actually sourced and what is estimated between two sourced points.
 */
export interface CostPoint {
  /** Monthly volume this point was priced at, GB. */
  volumeGb: number;
  low: number;
  high: number;
}

/**
 * How a tool's cost scales. Exactly one basis per tool.
 *
 * `per-seat`'s `{low, high}` is not a headcount spread — `TEAM_SIZE_HEADCOUNT` supplies that,
 * multiplying both ends. Several per-seat tools (GitHub, dbt Cloud, Power BI) actually have two
 * different plan tiers at different per-seat rates, not one rate with a range; the convention used
 * throughout this project's tool records is `low` = the cheaper plan's rate, `high` = the pricier
 * plan's rate, so a tool's own `note` should say which plan each end assumes.
 */
export type CostBasis =
  | { basis: "volume"; points: CostPoint[] }
  | { basis: "per-seat"; perSeat: { low: number; high: number } }
  | { basis: "flat"; amount: { low: number; high: number } };

/**
 * A real, sourced dollar estimate for one tool. Approximate by nature — this deliberately reopens
 * the project's earlier "no dollar figures, too volatile" rule, so every figure carries its source
 * and the date it was recorded, and the UI shows both alongside a permanent disclaimer rather than
 * presenting a number as a quote.
 */
export interface CostEstimate {
  unit: "usd-per-month";
  cost: CostBasis;
  /**
   * Self-hosted tools only: infrastructure cost, kept separate from licence (which is $0 for the
   * open-source tools scored here — that fact is stated in `note`, not implied by this field's
   * absence). Same volume-checkpoint shape as `cost`, sized against `VM_SIZES` below.
   */
  hosting?: { basis: "volume"; points: CostPoint[] };
  note: string;
  source: string;
  /** YYYY-MM-DD, the date the figure was recorded, so staleness is visible, not hidden. */
  as_of: string;
}

/** Matches `StackState["profile"]["team"]`'s answer ids in `apps/web/src/landing.ts`. */
export type TeamSize = "solo" | "small-team" | "multiple-teams";

/**
 * The headcount a per-seat cost assumes for each `profile.team` answer — the midpoint of the
 * range named in that question's own tiles (1-3 / 5-15 / 25-100), named once here instead of
 * copy-pasted into every per-seat tool's `note`. Unanswered defaults to `"small-team"`: the
 * volume question can be reached without ever answering the team-size one (a hand-built stack
 * skips the guided start entirely), and a per-seat estimate is more useful approximate than absent.
 */
export const TEAM_SIZE_HEADCOUNT: Record<TeamSize, number> = {
  solo: 2,
  "small-team": 10,
  "multiple-teams": 60,
};

/** A self-hosted tool's `hosting` checkpoints are set against what a VM of about this size costs. */
export interface VmSize {
  name: string;
  vcpu: number;
  ramGb: number;
  usdPerMonth: number;
}

/**
 * Reference points, not a pricing engine: sourced once from AWS EC2 on-demand Linux pricing
 * (us-east-1 — stable, independently checkable), so a self-hosted tool's `hosting` figure can be
 * shown alongside a real, named comparison rather than asserted on its own.
 */
export const VM_SIZES: VmSize[] = [
  { name: "Small", vcpu: 2, ramGb: 8, usdPerMonth: 60 },
  { name: "Medium", vcpu: 4, ramGb: 16, usdPerMonth: 140 },
  { name: "Large", vcpu: 8, ramGb: 32, usdPerMonth: 280 },
  { name: "X-Large", vcpu: 16, ramGb: 64, usdPerMonth: 560 },
];

/**
 * Interpolates a low/high figure at `volumeGb` between two `CostPoint`s, in log-log space: pricing
 * spans several orders of magnitude here, and cost usually grows sub-linearly with volume (tiered
 * per-unit rates step down), so a straight line between two points would overshoot the middle. A
 * point at or below the lowest checkpoint clamps to it; at or above the highest, likewise — this
 * function only ever describes the sourced range, never extrapolates past it.
 */
function interpolatePoints(points: CostPoint[], volumeGb: number): { low: number; high: number } {
  const sorted = [...points].sort((a, b) => a.volumeGb - b.volumeGb);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (volumeGb <= first.volumeGb) return { low: first.low, high: first.high };
  if (volumeGb >= last.volumeGb) return { low: last.low, high: last.high };
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (volumeGb >= a.volumeGb && volumeGb <= b.volumeGb) {
      const t = (Math.log(volumeGb) - Math.log(a.volumeGb)) / (Math.log(b.volumeGb) - Math.log(a.volumeGb));
      return { low: logLerp(a.low, b.low, t), high: logLerp(a.high, b.high, t) };
    }
  }
  return { low: last.low, high: last.high };
}

/** Linear interpolation in log space, falling back to a plain linear blend when either end is $0 (log is undefined there). */
function logLerp(a: number, b: number, t: number): number {
  if (a <= 0 || b <= 0) return a + t * (b - a);
  return Math.exp(Math.log(a) + t * (Math.log(b) - Math.log(a)));
}

function costFromBasis(cost: CostBasis, volumeGb: number, team: TeamSize | undefined): { low: number; high: number } {
  if (cost.basis === "flat") return { low: cost.amount.low, high: cost.amount.high };
  if (cost.basis === "per-seat") {
    const seats = TEAM_SIZE_HEADCOUNT[team ?? "small-team"];
    return { low: cost.perSeat.low * seats, high: cost.perSeat.high * seats };
  }
  return interpolatePoints(cost.points, volumeGb);
}

/** One tool's vendor cost at a given monthly volume and team size. */
export function costAt(entry: CostEstimate, volumeGb: number, team: TeamSize | undefined): { low: number; high: number } {
  return costFromBasis(entry.cost, volumeGb, team);
}

/** One tool's hosting cost at a given monthly volume, or `undefined` if it has none (fully managed, or a library with no service of its own). */
export function hostingAt(entry: CostEstimate, volumeGb: number): { low: number; high: number } | undefined {
  if (!entry.hosting) return undefined;
  return interpolatePoints(entry.hosting.points, volumeGb);
}

export interface StackCost {
  volumeGb: number;
  /** Vendor/licence cost total across priced tools. */
  low: number;
  high: number;
  /** Infrastructure cost total across self-hosted tools in the stack that carry a `hosting` figure — always shown as its own line, never folded into `low`/`high`. */
  hostingLow: number;
  hostingHigh: number;
  /** Selected tools with a cost entry — low-to-high order in the total. */
  priced: string[];
  /** Selected tools with nothing recorded yet — the total is a floor, not a quote. */
  unpriced: string[];
  /** Selected tools whose hosting figure is included in `hostingLow`/`hostingHigh`. */
  hosted: string[];
}

/**
 * Sum of every selected tool's cost at one volume. A tool with no entry is never treated as free:
 * it goes in `unpriced`, so the total is always shown as a floor with an honest count of what is
 * missing from it. Hosting is summed and reported separately, since it is real infrastructure
 * spend, not part of what any vendor charges.
 */
export function estimateCost(tools: RenderTool[], volumeGb: number, team: TeamSize | undefined): StackCost {
  let low = 0;
  let high = 0;
  let hostingLow = 0;
  let hostingHigh = 0;
  const priced: string[] = [];
  const unpriced: string[] = [];
  const hosted: string[] = [];
  for (const tool of tools) {
    const entry = tool.cost;
    if (entry) {
      const c = costAt(entry, volumeGb, team);
      low += c.low;
      high += c.high;
      priced.push(tool.id);
      const h = hostingAt(entry, volumeGb);
      if (h) {
        hostingLow += h.low;
        hostingHigh += h.high;
        hosted.push(tool.id);
      }
    } else {
      unpriced.push(tool.id);
    }
  }
  return { volumeGb, low, high, hostingLow, hostingHigh, priced: priced.sort(), unpriced: unpriced.sort(), hosted: hosted.sort() };
}

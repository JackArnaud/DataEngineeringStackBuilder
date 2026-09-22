import { bandStages } from "./scope.js";
import { prefixOf } from "./taxonomy.js";
import type { Tool, ToolRecord } from "./types.js";

export type Delivery = "native" | "bundled" | "partner" | "community";
export type Maturity = "ga" | "preview" | "beta";

/** Strongest first. Used to pick the best delivery among equally scored parts. */
export const DELIVERY_RANK: Record<Delivery, number> = { native: 3, bundled: 2, partner: 1, community: 0 };
const MATURITY_RANK: Record<Maturity, number> = { ga: 2, preview: 1, beta: 0 };

/** One raw score from one leaf record, placed on one capability x stage cell. */
export interface Contribution {
  capability: string;
  stage: string;
  level: 1 | 2 | 3;
  /** Effective delivery, after any bundle downgrade. */
  delivery: Delivery;
  /** Delivery as scored in the leaf record. */
  scoredDelivery: Delivery;
  maturity: Maturity;
  constraint?: string[];
  inherited?: boolean;
  /** The leaf record that holds the score. */
  tool: string;
  /** JSON pointer to the score inside that record. */
  ref: string;
  note: string;
  source: string;
}

/** The receipt for a cell: one underlying score, traceable to its record and source. */
export interface Evidence {
  tool: string;
  ref: string;
  level: 1 | 2 | 3;
  delivery: Delivery;
  scored_delivery?: Delivery;
  maturity: Maturity;
  constraint?: string[];
  inherited?: true;
  note: string;
  source: string;
}

/** A level that is only available under a constraint, so it never counts as the base level. */
export interface ConditionalLevel {
  level: 1 | 2 | 3;
  delivery: Delivery;
  maturity: Maturity;
  constraint: string[];
  via: string[];
}

export interface Cell {
  /** `<capability>@<stage>` */
  key: string;
  capability: string;
  stage: string;
  /** Best level available without any constraint. 0 means only a conditional level exists. */
  level: 0 | 1 | 2 | 3;
  delivery?: Delivery;
  maturity?: Maturity;
  /** Leaf records that provide the base level. */
  via: string[];
  inherited?: true;
  /** Higher levels available only under a constraint such as an enterprise plan. */
  conditional: ConditionalLevel[];
  evidence: Evidence[];
}

/** A conditional level gated on nothing but which plan was bought, so a user can confirm they have it. */
export const isEnterpriseTierOnly = (c: ConditionalLevel): boolean => c.constraint.length === 1 && c.constraint[0] === "enterprise-tier";

/** True when confirming this tool's tier could promote at least one of its cells. */
export const hasEnterpriseTierUnlock = (cells: Cell[]): boolean => cells.some((c) => c.conditional.some(isEnterpriseTierOnly));

/**
 * With `tiered`, promote the best enterprise-tier-only conditional level into the base level: what
 * a user on that plan actually has, not a remedy they still need. Constraints that are not settled
 * by "which SKU you bought" (`own-cloud-only`, `region-limited`, or any combination with one of
 * those) are left exactly as scored.
 */
export function applyTier(cell: Cell, tiered: boolean): Cell {
  if (!tiered) return cell;
  const unlockable = cell.conditional.filter(isEnterpriseTierOnly);
  if (unlockable.length === 0) return cell;
  const best = unlockable.reduce((a, b) => (b.level > a.level ? b : a));
  if (best.level <= cell.level) return cell;
  return {
    ...cell,
    level: best.level,
    delivery: best.delivery,
    maturity: best.maturity,
    via: [...new Set(best.via)].sort(),
    conditional: cell.conditional.filter((c) => c.level > best.level),
  };
}

interface ScoreFields {
  level: 1 | 2 | 3;
  delivery: Delivery;
  maturity?: Maturity;
  constraint?: readonly string[];
  inherited?: boolean;
  note: string;
  source: string;
}

function contribution(tool: string, ref: string, capability: string, stage: string, s: ScoreFields): Contribution {
  return {
    capability,
    stage,
    level: s.level,
    delivery: s.delivery,
    scoredDelivery: s.delivery,
    maturity: s.maturity ?? "ga",
    ...(s.constraint ? { constraint: [...s.constraint] } : {}),
    ...(s.inherited ? { inherited: true } : {}),
    tool,
    ref,
    note: s.note,
    source: s.source,
  };
}

function leafContributions(tool: Tool): Contribution[] {
  const out: Contribution[] = [];
  for (const [capability, score] of Object.entries(tool.coverage ?? {})) {
    out.push(contribution(tool.id, `/coverage/${capability}`, capability, prefixOf(capability), score));
  }
  (tool.bands ?? []).forEach((entry, i) => {
    for (const stage of bandStages(tool, entry)) out.push(contribution(tool.id, `/bands/${i}`, entry.band, stage, entry));
  });
  return out;
}

/**
 * Coming out of a bundle, a part's own product code is a sibling product under one contract,
 * so `native` becomes `bundled`. Partner and community stay as they are. Portfolios do not
 * downgrade: their parts are separate purchases and `via` says which one provides the cell.
 */
function downgrade(delivery: Delivery): Delivery {
  return delivery === "native" ? "bundled" : delivery;
}

/**
 * Every raw score reachable from a record, following bundles and portfolios down to leaf
 * records. Coverage is never hand-written on a composite; it always comes from here.
 */
export function contributionsOf(
  id: string,
  records: Map<string, ToolRecord>,
  cache: Map<string, Contribution[]> = new Map(),
  stack: string[] = [],
): Contribution[] {
  const cached = cache.get(id);
  if (cached) return cached;
  if (stack.includes(id)) throw new Error(`composition loop: ${[...stack, id].join(" -> ")}`);
  const record = records.get(id);
  if (!record) throw new Error(`unknown record "${id}"`);

  let out: Contribution[];
  if (record.kind === "tool") {
    out = leafContributions(record);
  } else {
    const members = record.includes.flatMap((m) => contributionsOf(m, records, cache, [...stack, id]));
    const mapped = record.kind === "bundle" ? members.map((c) => ({ ...c, delivery: downgrade(c.delivery) })) : members;
    // A part reachable by two routes (a diamond) is one score, not two. Keep the stronger delivery.
    const unique = new Map<string, Contribution>();
    for (const c of mapped) {
      const key = `${c.tool}|${c.ref}|${c.stage}`;
      const seen = unique.get(key);
      if (!seen || DELIVERY_RANK[c.delivery] > DELIVERY_RANK[seen.delivery]) unique.set(key, c);
    }
    out = [...unique.values()];
  }
  cache.set(id, out);
  return out;
}

const uniqueSorted = (items: string[]): string[] => [...new Set(items)].sort();
const bestMaturity = (items: Contribution[]): Maturity =>
  items.reduce<Maturity>((best, c) => (MATURITY_RANK[c.maturity] > MATURITY_RANK[best] ? c.maturity : best), items[0]!.maturity);

function toEvidence(c: Contribution): Evidence {
  return {
    tool: c.tool,
    ref: c.ref,
    level: c.level,
    delivery: c.delivery,
    ...(c.scoredDelivery !== c.delivery ? { scored_delivery: c.scoredDelivery } : {}),
    maturity: c.maturity,
    ...(c.constraint ? { constraint: c.constraint } : {}),
    ...(c.inherited ? { inherited: true as const } : {}),
    note: c.note,
    source: c.source,
  };
}

const compareEvidence = (a: Evidence, b: Evidence): number =>
  b.level - a.level || a.tool.localeCompare(b.tool) || a.ref.localeCompare(b.ref);

/**
 * Collapse raw scores into one cell per capability x stage.
 *
 * The base level is the best score with no constraint, then the strongest delivery among
 * those, so partner-delivered breadth never reads as in-the-box. A constrained score never
 * raises the base level: it is listed as a conditional level instead, so a Starter buyer is
 * not credited with an Enterprise capability.
 */
export function buildCells(contributions: Contribution[]): Cell[] {
  const groups = new Map<string, Contribution[]>();
  for (const c of contributions) {
    const key = `${c.capability}@${c.stage}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const cells: Cell[] = [];
  for (const [key, group] of groups) {
    const { capability, stage } = group[0]!;
    const cell: Cell = { key, capability, stage, level: 0, via: [], conditional: [], evidence: group.map(toEvidence).sort(compareEvidence) };

    const base = group.filter((c) => !c.constraint);
    if (base.length > 0) {
      const rank = (c: Contribution) => c.level * 10 + DELIVERY_RANK[c.delivery];
      const top = base.reduce((best, c) => (rank(c) > rank(best) ? c : best));
      const winners = base.filter((c) => c.level === top.level && c.delivery === top.delivery);
      cell.level = top.level;
      cell.delivery = top.delivery;
      cell.maturity = bestMaturity(winners);
      cell.via = uniqueSorted(winners.map((w) => w.tool));
      if (winners.every((w) => w.inherited)) cell.inherited = true;
    }

    const conditional = new Map<string, Contribution[]>();
    for (const c of group.filter((c) => c.constraint && c.level > cell.level)) {
      const k = `${c.level}|${c.delivery}|${[...c.constraint!].sort().join("+")}`;
      conditional.set(k, [...(conditional.get(k) ?? []), c]);
    }
    cell.conditional = [...conditional.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, items]) => ({
        level: items[0]!.level,
        delivery: items[0]!.delivery,
        maturity: bestMaturity(items),
        constraint: [...items[0]!.constraint!].sort(),
        via: uniqueSorted(items.map((i) => i.tool)),
      }));

    cells.push(cell);
  }
  return cells.sort((a, b) => a.capability.localeCompare(b.capability) || a.stage.localeCompare(b.stage));
}

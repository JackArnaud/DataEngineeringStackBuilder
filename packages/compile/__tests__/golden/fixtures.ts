/**
 * The fixed records the golden test compiles. They are deliberately independent of the real
 * dataset, so researching or rescoring real tools never disturbs them, while the real
 * taxonomy, lenses and derivation rules do reach them: change any of those in a way that
 * reshuffles a visual and the golden test fails.
 *
 * Together they exercise: a specialist, a stage platform, a bands-only tool, a per-tool lens
 * override, a tie between equal parts, delivery ranking, a constrained (enterprise-tier) score,
 * a bundle, and a portfolio that contains a bundle.
 */
type Json = Record<string, unknown>;

const SOURCE = "https://example.com/golden";
const score = (level: number, delivery = "native", extra: Json = {}): Json => ({
  level,
  delivery,
  note: "Golden fixture note.",
  source: SOURCE,
  ...extra,
});

const base = (id: string, extra: Json): Json => ({
  id,
  name: id,
  vendor: "Fixture Co",
  kind: "tool",
  license: "open-source",
  deployment: ["self-hosted"],
  pricing_model: "free",
  taxonomy_version: "1.0.0",
  updated: "2026-01-01",
  ...extra,
});

/** Specialist. SQL transformation at level 3, tests and lineage on the transform stage. */
const modeller = base("fx-modeller", {
  coverage: { "transform.sql-transform": score(3), "transform.feature-eng": score(1, "community") },
  bands: [
    { band: "quality.tests", ...score(3), scope: ["transform"] },
    { band: "observe.lineage", ...score(2), scope: ["transform"] },
  ],
  presentation: { tagline: "A modelling tool." },
});

/** Ties with fx-modeller at sql-transform, and outranks it at feature-eng (partner beats community). */
const alt = base("fx-alt", {
  coverage: { "transform.sql-transform": score(3), "transform.feature-eng": score(1, "partner") },
});

/** Stage platform: three level-3 capabilities in one stage. Reverse ETL has no home in medallion. */
const mover = base("fx-mover", {
  coverage: {
    "ingest.batch-extract": score(3),
    "ingest.cdc": score(3),
    "ingest.stream-ingest": score(3),
    "ingest.reverse-etl": score(2),
  },
});

/** Derived placement is wrong here, so the tool carries its own medallion placement. */
const override = base("fx-override", {
  coverage: { "store.object-store": score(3) },
  lens_overrides: [{ lens: "medallion", zones: ["gold"], note: "Serves only curated marts in this setup." }],
});

/** Bands-only: no spine coverage, so scope is mandatory. One preview score, one unmapped in medallion. */
const sentinel = base("fx-sentinel", {
  bands: [
    { band: "quality.anomaly-detection", ...score(3), scope: ["ingest", "store"] },
    { band: "observe.cost-visibility", ...score(2, "native", { maturity: "preview" }), scope: ["store"] },
  ],
});

/** Masking at level 3 exists only on the enterprise tier. */
const warehouse = base("fx-warehouse", {
  tier_name: "Fixture Co Enterprise plan",
  coverage: { "store.warehouse": score(3), "serve.query-engine": score(3) },
  bands: [
    { band: "govern.access-control", ...score(2), scope: ["store", "serve"] },
    { band: "govern.masking", ...score(3, "native", { constraint: ["enterprise-tier"] }), scope: ["store"] },
  ],
});

const orchestrator = base("fx-orchestrator", {
  coverage: {
    "orchestrate.scheduling": score(3),
    "orchestrate.dependency-dag": score(2),
    "orchestrate.ci-cd": score(1, "partner"),
  },
});

/** Bands-only. Masking at level 2 is the unconstrained score that sits under fx-warehouse's enterprise one. */
const catalog = base("fx-catalog", {
  bands: [
    { band: "govern.catalog", ...score(3), scope: ["store"] },
    { band: "govern.masking", ...score(2), scope: ["store"] },
  ],
});

const suite = base("fx-suite", {
  kind: "bundle",
  deployment: ["saas"],
  pricing_model: "subscription",
  includes: ["fx-modeller", "fx-alt", "fx-warehouse", "fx-orchestrator", "fx-catalog"],
  bundling: "single-contract",
});

const cloud = base("fx-cloud", {
  kind: "portfolio",
  deployment: ["cloud-managed"],
  pricing_model: "usage",
  includes: ["fx-suite", "fx-mover", "fx-override"],
  bundling: "a-la-carte",
});

export const fixtures: Json[] = [modeller, alt, mover, override, sentinel, warehouse, orchestrator, catalog, suite, cloud];

# Project brief: data tooling coverage visualiser

## Goal

A website that visualises how data tools and platforms cover components of the data
engineering pipeline. The primary interaction is a **stack builder**: the user picks
tools, the site shows what's covered and what's missing, with gaps ranked by how much
they matter.

Design principle throughout: a rigorous **fact layer** (scored, sourced, boring) with a
separate **lens layer** on top that reprojects the same facts into different mental
models — medallion architecture, modern data stack, and so on. Visual styling reads from
the facts; it never replaces them.

---

## 1. Fact layer

### Spine — sequential pipeline stages

Stable capability IDs that tools are scored against:

| Stage | Capabilities |
|---|---|
| `ingest` | `batch-extract`, `cdc`, `stream-ingest`, `reverse-etl` |
| `store` | `object-store`, `table-format`, `warehouse`, `olap-serving` |
| `transform` | `sql-transform`, `code-transform`, `stream-processing`, `feature-eng` |
| `orchestrate` | `scheduling`, `dependency-dag`, `event-triggers`, `ci-cd` |
| `serve` | `query-engine`, `semantic-layer`, `bi-viz`, `data-apps`, `ml-serving` |

### Bands — cross-cutting concerns

`govern` (catalog, access-control, masking, policy), `quality` (tests, contracts,
anomaly-detection), `observe` (monitoring, lineage, cost-visibility), `platform` (infra,
environments, dev-experience).

Bands are scored **per stage**, not once per tool. This is load-bearing. Snowflake
governs data in `store` and `serve` but not while Fivetran is moving it. dbt tests
`transform` but not the raw landing zone. A single band score per tool hides exactly the
gaps the stack builder exists to find.

### Coverage scale (4 levels)

- `3` core — a primary reason the product exists; first-class, no add-ons
- `2` native — genuinely built in, but secondary
- `1` extended — only via plugin, partner, marketplace, or real custom work
- `0` none

Paired with `delivery`: `native` | `bundled` | `partner` | `community`, so
partner-delivered breadth never renders identically to in-the-box capability.

### Scoring rules

- Score the band where the tool can **observe or control the data itself**, not where
  the vendor claims it helps. No data passing through it and no registration with it
  means 0, whatever the integrations page says.
- Any level >= 1 requires a `note` and a `source` URL.
- Score the product **as sold at a single SKU**. Enterprise-tier-only capability gets a
  separate record or an explicit `constraint` flag, never a free upgrade.
- **Sparse encoding**: only record non-zero values. Absence means 0.

### Tool record

```json
{
  "id": "dbt-core",
  "name": "dbt Core",
  "vendor": "dbt Labs",
  "kind": "tool",
  "license": "open-source",
  "deployment": ["self-hosted"],
  "pricing_model": "free",
  "interfaces": ["sql", "yaml", "cli"],
  "taxonomy_version": "1.0.0",
  "coverage": {
    "transform.sql-transform": {
      "level": 3,
      "delivery": "native",
      "maturity": "ga",
      "note": "...",
      "source": "https://..."
    }
  },
  "bands": [
    {
      "band": "quality.tests",
      "level": 3,
      "delivery": "native",
      "scope": ["transform"],
      "source": "https://..."
    }
  ],
  "proposed_capabilities": [],
  "presentation": { "role": "modeller", "tagline": "...", "hue": "teal" },
  "pairs_with": ["snowflake", "airflow"],
  "updated": "2026-09-20"
}
```

`scope` on a band is shorthand for repeating the same score across stages.

**`scope` is required when a tool has no spine coverage.** Bands-only tools (Monte
Carlo, Great Expectations, Collibra) would otherwise fall through the default and score
zero everywhere. When spine coverage does exist, an omitted `scope` defaults to the
stages the tool occupies.

`archetype` (specialist / stage-platform / end-to-end) is **computed** from coverage
spread, never hand-assigned.

### Criticality weights

Each band x stage cell carries a `criticality` weight **in the taxonomy**, not per tool.
It's a constant of the domain. Quality at `ingest` is high; cost-visibility at
`orchestrate` is low. This is what lets the stack builder rank gaps rather than dumping
forty empty cells on the user.

---

## 2. Lens layer

A lens is a projection of the same facts into a different mental model. Ship the raw grid
as an audit lens, plus medallion first. Later: modern data stack layers, lambda/kappa
batch-vs-stream paths, team ownership.

**Map at stage level; capabilities are exceptions.** Each lens maps every stage to zones,
with capability-level rules only where the stage default is wrong. A new capability then
auto-places correctly in every lens without touching a single lens file.

```json
{
  "id": "medallion",
  "name": "Medallion architecture",
  "zones": ["source", "bronze", "silver", "gold", "consume"],
  "defaults": {
    "ingest": ["source", "bronze"],
    "store": ["bronze", "silver", "gold"],
    "transform": ["silver", "gold"],
    "orchestrate": "all",
    "serve": ["consume"]
  },
  "overrides": [
    { "match": "transform.stream-processing", "zones": ["bronze", "silver"] }
  ],
  "unmapped": "rail"
}
```

`unmapped` is mandatory and explicit: `drop` or `rail`. Medallion has no honest home for
cost-visibility or reverse-ETL, and capabilities must not silently vanish when the user
switches lens.

Per-tool `lens_overrides` exist for cases where derivation is wrong. They require a note
and should stay rare.

### Role vocabulary (closed set)

`mover`, `substrate`, `engine`, `modeller`, `conductor`, `gatekeeper`, `sentinel`,
`surface`.

Derived from where a tool's level-3 scores cluster, with manual override. **Role drives
icon, colour and shape. Lens drives position and span.** dbt computes to `modeller`
spanning silver and gold.

Colour encodes what a tool does to the data, not which tool it is: movement /
transformation / structural. Maximum three ramps per view.

---

## 3. Build step

`taxonomy + tools + lens -> render model` (per tool: zone span, role, intensity from
coverage level). The site only ever reads the render model. No view logic in components,
no runtime derivation. Ship it as static JSON.

---

## 4. Built for change

New tools will keep breaking assumptions. These seven choices make that cheap, and most
cost nothing to decide now.

**Immutable taxonomy IDs.** Never reuse or repurpose an ID. Every entry carries
`status: active | deprecated | superseded_by`, plus successors and a migration mode:

```json
"store.table-format": {
  "status": "superseded_by",
  "successors": ["store.table-format-managed", "store.table-format-rest-catalog"],
  "migration": "fan-out"
}
```

A fan-out copies the old level onto both successors and marks them `inherited: true`
until re-scored. Splitting a capability becomes a data migration with a visible queue,
not a rewrite.

**Stage-level lens mapping.** As above. Without it, every new capability is an N-lens
edit and one of them gets forgotten.

**`proposed_capabilities` escape hatch.** A tool record is never blocked on a taxonomy
change. Proposals don't score and don't render, but they feed a taxonomy backlog report —
evidence-backed pressure showing where the model needs to grow, gathered as a side effect
of normal work. Without it, novel capability gets crammed into the nearest existing ID,
which quietly corrupts that ID's meaning across the whole dataset.

**Composition, implemented from day one.**

```json
{
  "id": "databricks",
  "kind": "bundle",
  "includes": ["databricks-sql", "databricks-workflows", "unity-catalog", "dlt"],
  "bundling": "single-contract"
}
```

Bundle coverage derives from its parts (max level, with a downgrade rule for `delivery`),
never hand-written. This is the one that genuinely hurts to retrofit: once thirty flat
records exist, half of them secretly suites, untangling means re-researching most of the
dataset. Databricks forces it, but Fabric, Snowflake, AWS and GCP all land the same way.

**Flags, not more levels.** When something doesn't fit the four levels, add orthogonal
flags — `maturity: ga | preview | beta`, `constraint: own-cloud-only | region-limited |
enterprise-tier` — never a level 4, half points, or a second scale. Scale drift is how
these frameworks die, and it always starts with one reasonable exception.

**Versioned taxonomy, stamped records.** `taxonomy_version` on every record, auto-flagging
`needs_review` when it lags. Otherwise "scored 0 because we checked" is indistinguishable
from "scored 0 because this capability didn't exist yet", and after two revisions nobody
can tell which records are trustworthy.

**Golden-file tests on the render model.** A fixed set of records with expected compiled
output, so a taxonomy or lens change that reshuffles existing visuals fails loudly. This
is what makes the other six safe to use.

---

## 5. Invariants

1. **Keep the receipts.** Every stylised element clicks through to its underlying scores,
   notes and source links. Without this it's a vendor slide.
2. **Gaps survive lens changes.** If a lens can hide a gap the grid found, the mapping is
   wrong. This must be a real test, not a note — otherwise it quietly stops being true
   around the third lens.
3. CI validation: every capability maps to a zone or is explicitly unmapped in each lens;
   every level >= 1 has a note and source; every bands-only tool has explicit `scope`.

---

## 6. First deliverables

1. `taxonomy.json` — stages, capabilities, bands, criticality weights, status fields
2. `tool.schema.json` — JSON Schema for tool records, with validation
3. `lenses/medallion.json` and `lenses/grid.json`
4. Four seed tools, chosen to exercise every structural assumption:
   - dbt Core — specialist
   - Fivetran — stage platform
   - Databricks — bundle / composition
   - Monte Carlo (or Great Expectations) — bands-only, no spine coverage
5. The compile step producing the render model, plus golden-file tests
6. Stack builder UI against the render model

**Do the seed tools before any UI work.** Scoring Databricks and a bands-only tool will
force decisions the schema doesn't yet anticipate, and it's far cheaper to find those
with four records than with thirty.

---

## Open questions — please ask, don't assume

- Tech stack and hosting
- Target tool count and curation policy (curated ~30 vs broad coverage)
- Whether tool data lives in JSON files in-repo or a CMS
- Whether the stack builder persists or shares a stack via URL

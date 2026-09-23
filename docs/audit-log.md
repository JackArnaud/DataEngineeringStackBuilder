# Capability audit log

A running review of the scored data, one capability at a time instead of one vendor at a time,
so the same real-world situation (an edition-gated feature, a narrower claim than the capability
name suggests) gets judged the same way everywhere it appears.

## How a pass works

1. Generate the review sheet: `npx tsx packages/compile/scripts/audit-sheet.ts <capability-id>`.
   It lists every record scored on that capability — level, delivery, constraint, scope, note and
   source, one block per tool.
2. Re-fetch each source URL and check the note's claim still holds: does the feature exist as
   described, is it native or does it need an add-on, and is it gated behind an edition or tier
   that the record doesn't yet flag with an `enterprise-tier` constraint?
3. Fix what's wrong, re-run `npm run validate && npm run test`, and check the worked examples in
   `apps/web/src/examples.ts` that use an affected tool still describe the real gap output — a
   constraint added or removed can move a capability in or out of a stack's critical gaps.
4. Add a row below: date, capability, records checked, what changed.

## Passes

### 2026-09-22 — `govern.masking` (6 records)

Prompted by a question about whether Snowflake's masking was mislabelled. It wasn't — the
`enterprise-tier` constraint on `snowflake-horizon:govern.masking` is correct and confirmed against
the current editions page. But checking the other five records the same way found a real
inconsistency:

- **`gcp-bigquery:govern.masking` — fixed.** Scored level 3, native, no constraint. BigQuery's own
  editions page lists dynamic data masking under Enterprise and Enterprise Plus only, and says
  Standard has "no access to fine-grained security controls" — the same shape of gating as
  Snowflake's, just not flagged. Added `constraint: ["enterprise-tier"]`, reworded the note, and
  moved the source to the editions page (matching how `snowflake-horizon` sources its own
  constraint). Ripple: `packages/compile/__tests__/seeds.test.ts` and `suggest.test.ts` had baked
  in the old behaviour (BigQuery offered as an unconstrained fix for a missing masking gap); both
  updated. Two worked examples using BigQuery (`Google Cloud analytics on GitLab`, `Features to a
  model on Google Cloud`) gained a new criticality-5 gap; both notices updated to mention it.
- **`gcp-bigquery:govern.access-control` — fixed as a side effect.** The note described only
  BigQuery's column-level security via policy tags — the same Enterprise-only feature as masking,
  scored under the wrong capability. Rewritten to describe the actual access-control mechanism
  (project/dataset/table/view IAM roles, available on every edition, no constraint needed), which
  is what `govern.access-control` is meant to capture.
- **`aws-redshift`, `oracle-database`, `postgres`, `unity-catalog` — confirmed, no change.** Each
  note's claim still matches its source. `oracle-database`'s note already flags that the page
  doesn't state a licence requirement rather than guessing one; left as is.

**Next passes, in priority order** (bands generate the noisiest gaps, so they go first): the
remaining band capabilities scored on 10+ records — `govern.access-control` (24), `observe.monitoring`
(24), `platform.infra` (18) — then the rest of govern/quality/observe/platform, then the six spine
stages.

### 2026-09-23 — every band cell a user could see as a warning with no suggestion (20 cells)

A different shape of pass: not "is an existing score still right", but "is there a real product
behind every warning at all". Prompted by a user noticing ingest-stage gaps (anomaly detection, data
contracts) offering no suggestions. `suggestTools` itself was correct — the gap was in the data.
Audited the whole grid programmatically: every `capability@stage` cell with criticality > 0 and zero
scorers anywhere in the 102-record dataset, not just at ingest. Found 20. For each, either real,
sourced evidence closed it, or the criticality was corrected to 0 with a written rationale — the same
choice already established for `govern.masking@orchestrate`, extended here to seven more cells.

**Closed with real coverage (13 cells, 9 tool records touched):**
- `quality.contracts` at **ingest** and **source**: `aws-glue` (Schema Registry), `azure-event-hubs`
  and `gcp-pubsub` (both have native, unconstrained topic schemas that reject a non-conforming
  message at publish time) all score it now — a genuine producer-consumer contract at the stream
  boundary, not a stretch.
- `quality.contracts` at **store**: `databricks-runtime` — Delta Lake's schema enforcement, on by
  default, distinct from the row-level assertions already scored elsewhere as `quality.tests`.
- `quality.contracts` at **serve**: `dbt-platform-services` — the Semantic Layer, documented by dbt
  itself as "a contract/interface between the data platform and downstream consumers."
- `govern.masking` at **ingest**: `aws-glue` — the Detect PII transform (redact, partial redact or
  SHA-256 hash), usable inside a streaming ETL job.
- `govern.policy` at **ingest** and **source**: `aws-kinesis`, `azure-event-hubs`, `gcp-pubsub` — a
  stream or topic's own configurable retention period, one real lever of the "retention, residency,
  classification" the capability names, scored at level 2 (a single lever, not the fuller thing a
  governance platform manages).
- `govern.catalog` at **source**: `azure-purview` — its scope was already `store`/`transform`/`serve`
  only; its own connector list shows scanning and classification reach on-prem SQL Server, Oracle,
  SAP, Salesforce, Snowflake, BigQuery and more, so `source` was an underscoping, not a gap. Checked
  and *not* extended: `govern.policy` — Purview's own connector table shows policy application is
  "No" for nearly every external source, so that one stays as it was.
- `govern.catalog` at **ingest**: `aws-glue` — a Kinesis or Kafka stream used by a Glue streaming job
  can be registered as a Data Catalog table (manual for Kafka, optional for Kinesis), scored level 2
  as a second, narrower band entry alongside the existing level-3 store entry, not a blanket bump.
- `observe.lineage` at **orchestrate**: `apache-airflow` — the OpenLineage provider has shipped in
  Airflow itself since 2.7, emitting lineage events on every run (needs a backend like Marquez to
  consume them, hence level 2 not 3).
- `observe.lineage` at **source**: `azure-purview` — same connector evidence as its catalog scope.
- `quality.anomaly-detection` at **serve**: `power-bi` — native anomaly detection on a line/area
  chart's time series, with a natural-language explanation, no external model.
- `quality.tests` at **orchestrate**: `databricks-workflows` — a validation pipeline's Lakeflow
  Declarative Pipelines expectations can gate a downstream task in the job graph, a quality assertion
  enforced by orchestration itself, not only inside one pipeline.

**Corrected to criticality 0 (7 cells), `data/taxonomy.json` → `1.0.4`:** `quality.contracts`,
`quality.anomaly-detection`, `govern.catalog` and `govern.policy` at **orchestrate** — same rationale
as the existing masking override: orchestration passes no data values through, so there is nothing
for these to act on there. `quality.anomaly-detection` at **source** — the tools that reach a source
system at all read its metadata and configuration (a scan, a stream's schema and retention); watching
the *shape of its data* over time needs either runtime access to a system that usually sits outside
the stack, or the data to already be flowing into it. `platform.environments` and
`platform.dev-experience` at **source** — a source system is not part of the stack, so it is not one
of the environments the stack promotes its own code through, and nothing is authored or debugged
against it directly.

**Ripple:** `packages/compile/__tests__/golden/expected/{render-model,gaps}.json` regenerated
(`UPDATE_GOLDEN=1 npm test`) — purely the seven criticality cells going to 0 and the new `.tiered`-
adjacent coverage; `compile.test.ts`'s hardcoded `taxonomy_version` assertion bumped to `1.0.4`.
`suggest.test.ts`'s ecosystem-ordering test had **two stale fixture pairings that no longer produced
their gap before this pass even started** (unrelated pre-existing drift, caught only because this
pass tipped a third one over the same threshold) — its silent `.flatMap`-drops-a-miss pattern was
replaced with a hard failure naming the stale pair, so this can't happen silently again. Two worked
examples' notices were stale against the new coverage (`Oracle estate to a cloud warehouse`:
anomaly detection is no longer *only* closable on a higher Snowflake plan, Power BI already covers
Serve; `Azure data platform with Azure DevOps`: Purview's catalog/policy gap moved from "the other
stages" to just Ingest) and were reworded; every other example's notice was checked against a full
before/after gap diff across all 17 examples and still holds.

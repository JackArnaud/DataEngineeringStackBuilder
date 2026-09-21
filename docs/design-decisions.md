# Design decisions

Where the implementation extends or departs from `data-tooling-visualiser-brief.md`, and what is
deliberately not enforced yet. Each is cheap to reverse now and expensive once records exist.

## Extensions to the brief

**Six-stage spine.** A `source` stage comes before `ingest` (`source.oltp`, `source.saas-api`,
`source.file-drop`, `source.event-stream`). Oracle and Postgres are the origin on the left of most
diagrams, and the medallion lens has a `source` zone that needs something to hold.

**Three record kinds, not two.** `tool`, `bundle` (`single-contract`) and `portfolio`
(`a-la-carte`). Max-level derivation is honest for a bundle you bought whole and a lie for AWS,
where nobody has all of it. Portfolio-derived coverage is for comparison views only; the stack
builder composes the member services. `bundling` is fixed by `kind` and the schema rejects a
mismatch. Members may themselves be bundles or portfolios; loops are rejected.

**Criticality is band x stage with capability overrides.** The brief gives a band x stage matrix
but its own example is `cost-visibility`, which is a capability. So the matrix is the default and
`overrides` handle exceptions, each with a required rationale. Weights run 0-5; `0` means not
applicable and never surfaces as a gap. Every cell must be present.

**Lens rules resolve most-specific-first.** Exact capability ID, then `<stage-or-band>.*`, then
the stage default. Band cells are placed by the stage they are scored at, so `govern.access-control`
at `store` lands wherever `store` does. A placement of `unmapped` is explicit and honours the
lens's `drop`/`rail` policy.

**Scale consistency is enforced.** The four levels imply which deliveries are possible: level 2 and
3 mean built in, so `native` or `bundled` only; level 1 means extended, so never `native`. This
is how the scale is kept from drifting, one reasonable exception at a time. Relax it in
`scoreRules` in `tool.schema.json` if a real case argues otherwise.

**File name equals record ID.** `data/tools/<anything>/<id>.json`. Subfolders are free
organisation (e.g. one per cloud); the ID is globally unique.

**`sku` field.** Optional free text naming the edition that was scored, so the single-SKU rule is
auditable.

## How the compile step derives things

These were decisions the brief left open. All are revisable; the golden test will show exactly
what moves.

**A constrained score never raises the base level.** A cell's `level` is the best score with no
constraint. A higher score that needs a constraint (an Enterprise plan, one region) is listed under
`conditional` with its constraint and `via`, and only if it beats the base. A tool that has only a
constrained score has level 0 and a conditional entry. Reporting the constrained level as the base
would hand an Enterprise capability to a Starter buyer. It applies to every constraint, not only
`enterprise-tier`. *Chosen over* reporting the higher level with a flag, which makes every consumer
remember to check the flag.

**Delivery downgrades at a bundle, not at a portfolio.** Coming out of a bundle, a part's `native`
becomes `bundled` (a sibling product under one contract); partner and community are unchanged. A
portfolio's parts are separate purchases, so nothing is downgraded and `via` names the service. A
bundle nested in a portfolio keeps its downgrade. The evidence for the cell records the delivery as
scored.

**Ties are shown, not hidden.** The winner is the highest level, then the strongest delivery
(native, bundled, partner, community). Every part that ties on both is listed in `via`, sorted.
Every underlying score, winner or not, stays in `evidence` so the cell can show its receipts.

**Span is the core; intensity is the rest; bands are an overlay.** A tool's `span` in a lens is the
zones where its spine cells are strongest (level 3, or its best level if it has none). Every zone its
spine cells reach carries an `intensity` from the level. Band capabilities are placed by the stage
they are scored at but drawn as an overlay, never as span. This is what makes dbt OSS a modeller
spanning silver and gold, as the brief expects, even though it scores level 2 on orchestration and
level 2 on testing source tables.

**Role and archetype are derived from data, not code.** `data/derivation.json` holds the role
vocabulary (in tie-break order), which role each capability suggests, the weight of a band relative
to a spine capability, and the archetype thresholds. It is validated like the taxonomy: every
capability must resolve to a role, and the role list must match the tool schema's override enum.
A role is the plurality among a tool's top-level capabilities; an archetype comes from level-3
spine coverage only. These are heuristics. Where they land wrong, `presentation.role` overrides
the role, and the render model keeps the derived role beside it.

**Conditional levels are not placed in lenses.** A tool sits where it is as sold, not where a higher
plan would put it.

## How gaps are found

`computeGaps(renderModel, { tools, needs })` in `packages/compile/src/gaps.ts`. Gaps are facts about
a stack and never depend on a lens.

**Three kinds.**
- **Empty stage.** Nothing selected touches a pipeline stage. Ranked by the stage's own criticality.
- **Needed capability.** A spine capability the user says they need and the stack lacks. Ranked 5:
  the user's word outranks a default. Spine capabilities are only gaps when asked for, so a stack is
  not buried in problems it does not have.
- **Band gap.** A governance, quality, observability or platform capability missing at a stage the
  stack occupies. Ranked by the band cell's criticality. A stage the stack does not occupy is
  reported once as an empty stage, not as a dozen band gaps.

**`source` is never a gap.** Its criticality is 0. The systems data comes from usually sit outside
the stack, so "no source tool" is normal. Stage criticality lives in the taxonomy, on the same 0-5
scale as band cells, where 0 means not applicable.

**Level 1 counts as covered.** A stage or cell reached only through a community extension or partner
is covered, and the report carries `best_level` so a view can show it as thin. A score that needs a
higher plan does not count as coverage: it appears on the gap as a remedy (`conditional`).

**A lens can only place a gap, never hide one.** `projectGaps` puts each gap in zones or, when the
lens has no zone for it, in its rail. This is invariant 2, enforced three ways: statically, the
validator rejects any lens with `unmapped: "drop"` that leaves a cell unmapped which could be a gap
(`lens-drop-hides-gap`); dynamically, tests project ten stacks, including the worst case of one tool
with every spine capability needed, through every lens and assert nothing is dropped; and a test
shows the check itself fails when a lens is broken.

**Taxonomy patch versions do not trigger review.** Adding stage criticality made this 1.0.1. A record
is flagged `needs_review` only when its major.minor lags, because a patch changes weights and wording
but never which capabilities exist. A record stamped with a newer patch than the taxonomy is still an
error.

**One weight was corrected after seeing real rankings.** `observe.lineage` at `orchestrate` inherited
the band's 5, which is right for monitoring and wrong for lineage. It now overrides to 2. The full
grid was scanned and this was the one clear misfit; the rest follow their band's shape.

## How the site looks and behaves

Built with the dataviz method: colour is computed and validated, not chosen by eye.

**Three colour families, chosen for what a tool does to the data.** Movers are blue, transformers
(engine, modeller) are orange, and everything structural is aqua. These are the palette's first
three slots, the only trio that passes every all-pairs check in both modes (a blue, aqua, violet
trio fails in dark mode). Each family has three steps for the coverage level, and every one of the
six ramps was validated as an ordinal ramp: monotone lightness, visible step gaps, low end at least
2:1 against the surface. Shape carries the role within a family, so no role depends on colour.

**Severity uses the reserved status colours, never the role hues.** Critical, serious and moderate
are red, orange and yellow, each with its own icon shape and a word. Orange is close to the
transformation family, so severity chips never appear inside the lanes and always carry icon and
word. Criticality 1 and 2 are neutral: worth knowing, not alarming.

**A mark is tall where a tool is core and short where it only reaches.** Colour step is the
coverage level. The visible bar is 12 or 22px inside a 28px hit area.

**A capability the lens spreads over every zone does not define a tool's core position.**
Orchestration is in every zone of the medallion lens, so counting it made dbt platform "core"
everywhere and hid its real position (Silver, Gold, Consume). Those cells still count toward reach
and intensity. A tool with nothing else, like Lakeflow Jobs, falls back to spanning everything.

**The gap chip in a zone counts gaps at the worst tier, not every gap that touches it.** A gap that
spans several zones inflated each into a number nobody could act on ("32"). The tooltip and detail
panel carry the full count.

**Every mark, zone and gap opens a detail panel with the receipts**: the score, its note and its
https source link. Bundles list their parts and say nothing is scored by hand; a level that needs a
higher plan is shown as a note, never as coverage. Tooltips repeat what the table view and the panel
say; they never gate anything.

**State is the URL**, and nothing else is stored: `?tools=...&needs=...&lens=...&view=...`. Lists
are sorted so the same stack is always the same link, and ids the data no longer has are dropped
silently.

**Accessibility was measured, not assumed.** An axe audit in Chrome across ten states (light, dark,
chart, table, both panels) found no violations, including colour contrast. The checks it could not
decide are all rows scrolled out of view inside the tool list, using tokens that passed where
visible. There is a table view for the chart, forced-colours and print get a density texture at 45
degrees, and the dark palette is its own validated set, not a flip.

**The site imports only a browser-safe entry point** (`packages/compile/src/browser.ts`), and a test
fails if anything reachable from it touches Node.

## Left out on purpose

**`presentation.hue`** is not in the schema, although the brief's example record has it. The brief
says colour encodes what a tool does to the data, not which tool it is, and a per-tool hue is how
that erodes. Role drives colour. Add it back to `$defs/presentation` if you disagree.

**`archetype`** is rejected if present. It is computed from coverage spread, never assigned.

## Not enforced yet

- **Alternatives between capabilities.** A stack needs `object-store` *or* `warehouse`, not both.
  Needs are per capability, so a user who ticks both is told about whichever is missing. Modelling
  "one of" needs would need a grouping the taxonomy does not have.
- **Band gap volume.** A real stack has around 50 band gaps. They are ranked, but a view has to show
  only the top few; nothing here caps them.
- **ID immutability.** Deleting a taxonomy ID fails validation only if a record still uses it.
  Repurposing one is invisible without history. A CI check that diffs the ID set against `main`
  would close the first half.
- **Taxonomy backlog report** built from `proposed_capabilities`. Proposals are validated and
  otherwise inert.
- **The render model is not schema-validated.** Its shape is a TypeScript interface exported from
  the compile package. A JSON Schema for it would let a non-TypeScript consumer validate it.
- **Plan tiers as separate records.** Settled by phase 6 without a schema change. A tier that is a
  different product bought separately gets its own record: `power-bi` is the Pro tier, and
  `fabric-power-bi` is Power BI on a Fabric capacity. A tier that adds a few capabilities to one
  product uses the `enterprise-tier` constraint: Snowflake Horizon and Tableau carry ten of them
  between them, and the base level is never raised. Rules about capacity size (viewers need a Pro
  licence below F64) sit in the `sku` text. The flag would scale poorly if a single record needed
  more than about ten constrained scores; none does yet.
- **Where a suite's platform features live.** Fabric's workspaces and deployment pipelines are their
  own record (`fabric-platform`) inside the `microsoft-fabric` bundle, not scores on an unrelated
  workload. It keeps `orchestrate.ci-cd` and `platform.environments` attributable to the feature
  that provides them.
- **Vendor is a picker grouping.** Microsoft Purview is documented as a Microsoft product but is
  listed under the "Microsoft Azure" vendor so it sits beside the Azure services in the picker, and
  the portfolio's "Add all" uses the portfolio's `includes`, not whatever shares the vendor label.
- **dbt is three distributions, modelled as OSS plus a layer.** The docs now name dbt v1 (Python, final
  minor 1.13), dbt v2 (the Rust engine formerly called Fusion, proprietary but free, their default
  recommendation) and dbt OSS (the Apache 2.0 build of v2). `dbt-core` is dbt OSS. `dbt-v2-additions`
  scores only what v2 adds on top (SQL comprehension, language server, column-level lineage), because
  the docs describe v2 as "on top of the open source layer". The `dbt` bundle is the two together, and
  the dbt platform bundle takes both, since the platform runs either engine. dbt v1 is not scored. It is
  the only line that lists PostgreSQL, so Postgres no longer pairs with dbt and the starter stack moved
  to Snowflake. Scores for dbt OSS come from pages that describe the framework generally, and the sku
  says Python models, MetricFlow and state selection were not confirmed for v2.
- **Hosting choices are records that repeat the engine's scores.** Apache Spark and Airflow run the
  same on every host, so each host gets its own record: self-hosted, on Kubernetes, and managed
  (Amazon EMR, Dataproc, Synapse, Fabric and Databricks for Spark; MWAA, Composer, Astronomer and Fabric
  for Airflow). The duplicate scores are deliberate, so a user who picks one host sees complete
  coverage without also picking a framework. The host-specific difference is a `platform.infra` band.
  `pairs_with` links each managed host to its open-source engine. The alternative was a framework record
  plus hosting layers in a bundle, as dbt v2 is built; it was passed over because there are five or more
  hosts per engine.
- **API gateways are bands only, plus a proposal.** Azure API Management scores access control,
  policy and monitoring at Serve, and proposes an "API gateway for data access" capability, because
  nothing in the taxonomy describes publishing data as a managed API. Its tiers were not checked, so no
  score is flagged enterprise-tier.
- **Roles have a stable id and a plain label.** The role ids (`substrate`, `gatekeeper`, `sentinel`,
  `conductor` and so on) are keys in the data, the tool schema and the derivation rules, and they stay.
  What people read is the `label` beside each id in `derivation.json`: Movement, Compute, Storage,
  Modelling, Orchestration, Governance, Monitoring and Consumption. The labels are job words that match
  the stage names, not invented nouns, and they can be reworded without touching any record. The render
  model carries them, so the site holds no copy of the vocabulary.


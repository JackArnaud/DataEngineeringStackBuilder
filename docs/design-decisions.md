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

**A confirmed tier promotes its remedy into real coverage — everywhere, not just the gap list.**
Masking scored `conditional` on `constraint: ["enterprise-tier"]` used to read as missing for
Snowflake even for someone who already pays for Enterprise, with no way to say so. `StackInput.tiers`
(tool ids) and `apps/web/src/state.ts`'s matching `StackState.tiers` let a user confirm they're on
the tier named by a tool's `tier_name`; `applyTier` (`packages/compile/src/derive.ts`) then promotes
the best `enterprise-tier`-only conditional level into the cell's base level before `computeGaps`
reads it, so the gap, its stage strip contribution and the tool's own receipts ("Reaches core only
on…") all agree. Only a conditional whose constraint is exactly `["enterprise-tier"]` is ever
promoted — `own-cloud-only`, `region-limited` and any multi-constraint combination are left alone,
since those are not settled by "which SKU you bought." The check on the tool's own detail panel is
labelled with the real plan name via the existing `constraintPhrase` helper, not a generic "an
Enterprise plan" — important for a bundle like Snowflake, whose own record carries no `tier_name`
even though a part it includes (`snowflake-horizon`) does.

The matrix reads a *compiled* per-tool, per-lens projection (`ToolLensView`, built once at compile
time by `projectTool`), which already discards conditional detail — deliberately, since a tool sits
"where it is as sold," not where a higher plan would put it. Rather than re-deriving that projection
client-side, the compiler now calls `projectTool` a second time for any tool with something to
promote, over the same cells run through `applyTier`, and ships the result as `ToolLensView.tiered`.
`effectiveLens(lens, tiers)` (also in `project.ts`) swaps a tiered tool's view in for both `LensMatrix`
and `stackBands`, so the matrix's spine marks and cross-cutting band bars move too, with zero line
changes inside `LensMatrix.tsx` itself — the swap already happened before the lens object reached it.
The extra `.tiered` view is only computed and shipped for tools that actually have something to
promote, so it adds negligible weight to `render-model.json`.

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
higher plan is shown as a note, never as coverage. Tooltips repeat what the detail panel says; they
never gate anything.

**State is the URL**, and nothing else is stored: `?tools=...&needs=...&use=...`. Lists
are sorted so the same stack is always the same link, and ids the data no longer has are dropped
silently.

**The page is typeset, not carded.** The first version read as a generic dashboard: rounded
cards, pill chips, soft shadows, a sans face throughout. The rewrite gives it a document's structure.
Headings are serif and numerals are monospace. Corners are 2px. Sections are separated by hairline
rules, with a heavier rule opening each one, instead of boxes. Selection is shown by ink fill, not
a tint, and lists (the landing choices, examples, gaps, overlaps) are ruled rows with a text link or
arrow rather than buttons in tiles. None of this touches the data colours above: the ramps and status
colours are unchanged, and axe still reports no violations in light, dark and at phone width.

**A tier is named, not generic.** Every `enterprise-tier` constraint used to render as the same
sentence, "an Enterprise plan," regardless of which tool or which real plan it meant. Tool records
now carry an optional `tier_name` (e.g. "Snowflake Enterprise edition," "Tableau Data Management"),
and every place that renders a constraint substitutes it in — a gap row can say "closable on
Snowflake Enterprise edition" instead of the generic phrase. *Chosen over* tracking actual list
prices: prices change constantly, vary by negotiation and region, and would break the rule that a
score only claims what a stable source backs; a tier's *name* is durable in the way a dollar figure
is not. The substitution only fires when every tool behind a remedy agrees on one tier name — a gap
closable through two vendors with different plans still falls back to the generic phrase, since one
sentence cannot name two tiers at once. `npm run validate` now rejects any `enterprise-tier` score on
a record with no `tier_name`.

**One thing at a time.** The builder page stacked six sections and a control bar, and read as a wall.
The main column now has three tabs: Coverage (the stage strip and the chart), What's missing, and
Overlaps (only while two of your tools share a task). The tab is in the address (`#missing`,
`#overlaps`), so a link can open on the gaps, and the counts sit on the tabs so nothing is hidden
unseen. What is left on each screen is what you act on first; the rest is one click away behind a
fold: the colour key, why a gap ranks where it does, each example's "what to look at", and the
overlaps where one tool clearly leads (only ties need a decision, so only they are open). In a gap's
detail, what goes wrong and what would close it come before the reasoning. The masthead is the name
and the three whole-stack actions; the stage filter is one select, not seven buttons.

**Accessibility was measured, not assumed.** An axe audit in Chrome across ten states (light, dark,
chart, both panels) found no violations, including colour contrast. The checks it could not
decide are all rows scrolled out of view inside the tool list, using tokens that passed where
visible. Forced-colours and print get a density texture at 45 degrees, and the dark palette is its
own validated set, not a flip.

**The site imports only a browser-safe entry point** (`packages/compile/src/browser.ts`), and a test
fails if anything reachable from it touches Node.

**A mark encodes one "how well," not two.** Every mark used to draw height (22px core, 12px reach)
on top of colour shade (level) on top of hue (role family) on top of row and column — five
channels in a small rectangle, and the height distinction was never explained anywhere on the
page. Height is now fixed; shade is the only "how well" signal, and core position moved entirely
into words (the tooltip, the aria-label, the detail panel), where it already lived alongside the
drawing. *Chosen over* keeping height and adding a legend entry for it: a channel that needs
explaining is a channel to cut, not to document harder.

**The colour key is a sentence, not a click.** The full role/ramp/level table stays behind a fold
— it's genuinely a lot (three ramps × three levels × eight roles) — but the one sentence that
actually matters, "colour says what a tool does to the data; how light or dark it is says how
well," is now always visible above the chart (`Legend.tsx`), not hidden behind "How to read the
colours and marks." Five of eight roles still share the one "structural" hue (storage, orchestration,
governance, monitoring, serving), which is a real limit on how much the colour alone can
discriminate — noted, not fixed here: the three-hue trio is CVD-validated (`dataviz` skill,
`docs/design-decisions.md`'s earlier entry), so widening it is a deliberate palette change to make
through the skill's validator, not a quick add.

**Cross-cutting bands name who, not just how much.** A "Govern" row used to be four unlabeled bars;
it's now "4 tools provide this" (or the names, for two or fewer), reusing the exact data the
tooltip already read (`lens.tools[t.id]?.bands[z]?.[band.id]`) but surfacing it on the page instead
of behind a hover. The stage strip lost its pips (`stage__pips`) for the same reason: a third,
unlabeled encoding of a level the status line or `SeverityChip` already states in words.

**Scale reuses "set aside," it doesn't invent a second severity system.** Eleven capabilities
already carried a `skip_when` — "one small team owns every table," "no personal, financial or
otherwise regulated values," "used for exploration rather than decisions" — written for the gap
detail, in prose. Each now also carries a `profile_tag` (`team-size` | `sensitivity` | `stakes`,
`data/taxonomy.schema.json`), naming which of three guided-start questions that prose is really
answering. Answering "Just me" or "No personal, financial or health data" doesn't lower a
criticality number or add a parallel scoring axis: it just ticks the same "Not relevant" a user
could tick by hand on that exact capability (`apps/web/src/state.ts`'s `profileSkips`, called from
`change()` and `parseState`), so it stays visible in the "set aside" fold and one click from being
brought back. *Chosen over* a numeric severity multiplier: a second axis a criticality score
travels through is a second thing to get wrong silently; reusing set-aside means the worst outcome
of a wrong guess is a fold with an extra row in it, not a gap that quietly reads as less severe
than it is. Spine gaps (nowhere to store data, nothing schedules jobs) carry no `profile_tag` and
are never touched — those aren't optional at any scale.

**A fourth colour, found rather than invented.** Five of eight roles shared the one
"structural" hue, which was a real limit on how much colour alone could tell tools apart — but the
existing trio (blue, orange, aqua) was the *only* three-hue subset of the documented eight-hue
palette that clears the all-pairs colour-vision check (`dataviz` skill), the harder bar a matrix
needs, where any two rows can end up side by side, not just the adjacent-pairs bar a bar chart or
line needs. Before touching anything, every remaining documented hue was tried as a fourth slot
against that trio, in both modes, through `validate_palette.js`: yellow (documented to fail),
magenta, red and green all failed the all-pairs floor. Violet passed — the light step already in
the reference palette (`#4a3aa7`) as-is, and a new dark step derived and validated for this project
(`#6b46c1`; the documented dark violet sat too close to dark-mode blue and failed). Its own 3-step
ordinal ramp (extended/native/core) was derived and validated the same way the other three ramps
were, in both modes. *Chosen over* leaving it at three hues and trying to fix the crowding some
other way: shape (the glyph) already carries role identity within a hue, so a fourth *hue* is the
one channel that was actually short.

Adding the slot made it worth asking what the five "structural" roles actually have in common, and
the honest answer was "not much beyond `not movement or transform`." Two of them — `substrate`
(storage) and `surface` (serving) — are about *where data lives*; data is genuinely at rest or in
transit through them. The other three — `conductor` (orchestration), `gatekeeper` (governance) and
`sentinel` (observability) — coordinate or watch the pipeline without any data value passing
through them (already true elsewhere in the data: orchestration carries an explicit note that "no
data values pass through" it). That split is what the new violet "Oversight" ramp takes; "Structure"
keeps the two roles that still fit it. `ROLE_RAMP` in `apps/web/src/roles.ts` is the only place this
mapping lives.

**Resources reorder suggestions, they never touch what's missing.** Two checkboxes in a new guided-
start step — prefer free and open-source, can sign a vendor contract — feed `suggestTools`
(`packages/compile/src/suggest.ts`) as a tie-breaker between the existing "is this tool good
enough" and "is it from a vendor I already use" checks, using `license` and `pricing_model`, both
already on every tool record. An unanswered resources step (the default) changes nothing — the
demotion for a capacity- or subscription-priced tool only starts once the step has actually been
answered, since an empty array must mean "never asked," not "confirmed no budget"; that distinction
was a real bug caught by a pre-existing test before it shipped. Gap severity, the gap list and the
matrix are entirely unaffected — only the order of a gap's "What would close it" list moves.

**What's missing is a tab, not a permanent sidebar.** The builder used to have a permanent sidebar
for adding and removing tools beside the chart. The sidebar is gone. In its place, a one-line bar
under the masthead names the stack and what it needs ("Snowflake, dbt (v2) and GitHub · needs BI and
visualisation") with a single "Edit stack" action. That action opens the same picker as before —
chips, the two tabs, the vendor list — in the existing side-sliding detail panel (a new `editStack`
kind alongside tool, zone and gap), so adding and removing a tool costs one extra click instead of a
permanent column, and nets out to more room for the page's actual subject. *Chosen over* keeping the
sidebar and only re-defaulting the tab: that would have left the picker just as prominent as the gaps
it now sits behind. Coverage is the default tab (What's missing and Overlaps sit beside it) — this
briefly went the other way, defaulting to What's missing on the reasoning that the tool should lead
with the gaps; it reverted once the coverage-first flow was live, since the chart is what most visits
are actually there to read, and the gap count on its tab already surfaces "what's missing" without
having to open on it.

**One lens, no table twin.** The Medallion architecture lens and the chart's table view were cut:
they read as options to weigh, not information anyone needed, and the audit grid's zones are
already the same six pipeline stages the "Coverage by stage" strip shows above it, so a second lens
mostly meant a second way to see the same thing. The lens engine itself is untouched — `medallion.json`
and its generic-engine test coverage (zone spanning, the "unmapped" rail, per-tool overrides) stay in
`data/` and `packages/compile`, since those are real capabilities worth keeping proven; the app just
always asks for the `grid` lens and never renders a switcher. *Chosen over* deleting the lens outright,
which would have meant rewriting the several compile-package tests that use it as their only real,
multi-zone example — a bigger, riskier change for a UI-only complaint.

**A gap is visible where you're already looking, not only on its own tab.** The matrix used to leave
an uncovered stage as blank cells, with the only signal a small chip easy to miss at the very bottom,
under every tool row and all of cross-cutting coverage. The chip row moved to sit directly under the
column headers, and a column with nothing covering it at all gets the same severity icon used
everywhere else in the app, in the header itself — reusing `severity()`, not a new colour. The
"Coverage by stage" strip above it got the matching treatment: an empty stage that matters now shows
the real `SeverityChip` ("5 Critical") instead of a plain "Nothing yet", so the two views never
disagree about how bad a gap is. Source stays exempt in both places (criticality 0: having no source
tool is normal), matching the gap engine's own rule that Source is never a gap.

**The tool actually used for a task stays solid; its competitors fade.** Where two tools can do the
same thing and one is picked (by score or by hand), the matrix used to draw every provider's mark
identically, so "who does this" was only in a line of small text on the tool's row. The mark for a
tool that is not the one used, at the specific zone it lost, is now dimmed (opacity only, not colour,
so it survives forced-colours and print); the one in use is left at full weight. A tie with no lead
yet dims neither, since fading one side would look like a decision that has not actually been made.

**A tier confirmation is asked for once, in one flat place, not discovered by clicking into every
tool.** The per-tool checkbox from the tier-declaration feature above was real but easy to miss: it
only showed on a tool's own detail page, so a stack with several enterprise-gated tools meant opening
each one in turn to even find out the question existed. `StackPanel.tsx` (the "Edit stack" panel)
now lists every tool in the stack with something to confirm — `hasEnterpriseTierUnlock` — as one flat
"Tiers" section right under the chips, each row a checkbox plus a link to that tool's own page for
anyone who wants the detail. Loading a pre-built example is the case that matters most: someone who
didn't hand-pick the tools has the least reason to know one of them has an Enterprise-gated feature,
so `onLoadExample` now opens straight to this panel whenever the loaded stack has anything to confirm
— `hasEnterpriseTierUnlock(lookup.tool(id)?.cells ?? [])` checked per tool before the mode switches —
instead of leaving it to be found. An example also clears any tier confirmed for the *previous* stack
(`tiers: []` in that same `change()` call): which plan someone is on is a fact about a tool they
chose, not one that should silently survive loading a demo they didn't. The label logic
(`constraintPhrase` naming the real plan, correct even for a bundle like Snowflake whose own record
carries no `tier_name`) is shared between the flat panel and the per-tool page via a new
`apps/web/src/tiers.ts`, so the two never say it two different ways.

**The matrix's tooltip is portaled to the body, not positioned inside the scrolling matrix.** It used
to sit `position: absolute` inside `.matrix-wrap`, which needs `overflow-x: auto` to scroll a wide
matrix — and setting only one overflow axis makes the browser clip the other one too, so a tooltip
for anything in the first couple of rows (exactly where a hover is most likely to land) rendered
above the container's own top edge and was silently clipped. It now renders via `createPortal` to
`document.body` in viewport coordinates, and additionally flips to open below the mark instead of
above when there genuinely isn't room (`r.top < 90`), so a mark near the very top of the viewport
still gets a tooltip that's fully on screen rather than relying on clipping never happening to matter.

**A level's tooltip says what to do with it, not just its name.** "Core" and "Native" read as two
meaningfully different tiers, but both mean the same actionable thing — nothing extra to install or
buy — and only "Extended" changes what a user has to do. The tooltip line now leads with that fact
(`Built in (Core)` / `Built in (Native)` / `Needs a plugin or add-on (Extended)`) instead of the bare
level word; `LEVEL_HELP` in `labels.ts` was reworded the same way for the per-tool detail panel's
"What do the levels mean?" fold, and the always-visible legend line now says it too, so nobody has to
open a fold to learn it. `LEVEL_LABEL` itself (the compact word used in badges and aria-labels
throughout) is untouched — changing that would have rippled through every level badge and a lot of
tests for a distinction worth keeping at that size, just not leading with.

**A cross-cutting band cell names who covers it and at what level, on hover, not just its colour.**
The `band` tooltip case already computed this (`tools.filter(...)` reading each tool's level for that
specific band and zone) but a "Best: Core" summary line buried it above the list. The summary line is
gone; the tooltip is now just the named tools and their levels ("AWS Lake Formation — Native"), or
"Nothing in your stack covers this here" when none do — the fact someone asking "how will this be
managed and by which tool" actually wants, not a level that could belong to any of them.

## Left out on purpose

**`presentation.hue`** is not in the schema, although the brief's example record has it. The brief
says colour encodes what a tool does to the data, not which tool it is, and a per-tool hue is how
that erodes. Role drives colour. Add it back to `$defs/presentation` if you disagree.

**`archetype`** is rejected if present. It is computed from coverage spread, never assigned.

## Not enforced yet

- **Alternatives between capabilities.** A stack needs `object-store` *or* `warehouse`, not both.
  Needs are per capability, so a user who ticks both is told about whichever is missing. Modelling
  "one of" needs would need a grouping the taxonomy does not have.
- **Band gap volume.** Mostly settled by the gap list (see "The gap list is a summary, not the facts"),
  which folds about 40 to 60 cell-level gaps into around 13 rows. Nothing yet judges whether a capability
  matters to a particular stack beyond the user setting it aside.
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
- **The gap list is a summary, not the facts.** `computeGaps` still returns one gap per capability and
  stage, because the matrix, the zone counts and the lens invariants need that grain. Real stacks came to
  40 to 60 of them, but only 13 distinct cross-cutting capabilities exist, each missing at up to six
  stages. `groupGaps` folds a capability's gaps into one row that keeps the worst criticality and lists
  its stages; the detail panel names the rest. Rows are split into "fix first" (empty stages, stated
  needs, and cross-cutting gaps of criticality 4 or 5) and "worth checking", which sits behind a fold by
  theme. Titles name up to three stages and count beyond that.
- **The user can set a cross-cutting capability aside.** "Not relevant" removes it from the list and from
  the matrix counts together, so the two agree, records it in the address as `skip=`, and keeps it under a
  "set aside" fold with one click to bring it back. Only cross-cutting capabilities can be set aside.
  Empty stages and stated needs cannot: the first is a fact, and the second the user can simply untick.
  This is a view filter. The report and every lens invariant are unchanged.
- **Why a gap matters is written down, separate from how it ranks.** Every stage that can be a gap and
  every capability carries an `impact` in the taxonomy: what goes wrong without it (one sentence, shown on
  the row), a concrete example, how AI use changes the stakes, and when it is reasonable to skip. The
  detail panel shows them in that order, then why it ranks where it does. Impact text never feeds the
  ranking, and a validator rule (`impact-missing`) means a new capability cannot ship without it. Adding
  or rewording it is a patch to the taxonomy (1.0.2), because it changes no capability and no weight.
- **Version control is proposed, not scored.** GitHub, GitLab and Azure DevOps are scored where the
  taxonomy has a place for them: CI/CD, scheduling and triggers at Orchestrate, and environments and
  access control for the stages whose artefacts are pipeline code (Ingest, Transform, Orchestrate,
  Serve). Keeping every change in reviewed history has no capability, and three records now ask for
  one. Adding a capability would be a minor version, which marks every record as needing review until
  it is scored against it, so it waits until the wider set of proposals is settled.
- **How AI fits, and what is deliberately not modelled yet.** AI meets a pipeline in two ways. It reads
  the output: features and training data for models, retrieval for applications, natural-language
  questions from assistants. And it helps operate the pipeline: copilots that write and fix pipelines,
  agents that read run history. The taxonomy covers the first only through `transform.feature-eng`,
  `serve.ml-serving`, `serve.semantic-layer` and `serve.data-apps`. What it does now for AI: the impact
  text names how each gap changes when AI uses the data (governance, quality and lineage matter more,
  because a model repeats bad or restricted data with confidence), and three example stacks end in a
  model or an assistant. Three ideas are recorded as proposals with sources, and not yet capabilities:
  vector search for retrieval (Cosmos DB, Fabric SQL database), AI assistance for building and
  operating pipelines (Fabric Data Factory, dbt platform, Azure DevOps through MCP), and natural-language
  access to data (Amazon Quick). Making them capabilities is a minor taxonomy version and a re-score of
  the AI-relevant records, so it needs a decision.
- **Example stacks are checked against real gaps.** Each example's "notice" line was written from the gaps
  the stack produces, and tests check that every example uses real tools, meets its own needs, fills at
  least three stages and stays under twenty gap rows. A notice can still go stale when scores change.
- **A guided start comes before any guidance.** A visitor with nothing chosen sees two choices, an example
  or "build my own", not the builder. Building your own is a short run of screens in pipeline order: where
  the data starts, where it is stored and processed, how it is modelled and scheduled, how people use it,
  how changes are kept under control, then what the stack has to do, then a review. Choosing a cloud adds
  a screen of its services. Every screen can be skipped, and every choice writes to the same state the
  builder reads, so nothing is lost when it opens. An address that already carries a stack goes straight
  to the builder, so a shared link shows what was shared, and the builder has a "Guided start" button and
  "Start over" returns to it. The tiles and need cards are curated lists in `apps/web/src/landing.ts`; a
  test checks that each is a real record or capability, so a rename cannot leave a dead tile, but a new
  tool does not appear on a screen until someone adds it.
- **Need cards are outcomes, not capabilities.** "Machine learning in production" stands for feature
  engineering and ML serving. A card is on when every capability it stands for is a need, so the cards and
  the needs tab always agree. The cards use plain words for the same reason the roles do.
- **Suggestions favour the stack's own ecosystem.** A tool from a vendor the stack already uses comes
  first, then one commonly paired with it, then the rest. It uses the vendor and the `pairs_with` links,
  with Azure, Fabric and Power BI counted as one vendor. The rule only reorders tools that provide the
  capability properly (native or core): a level 1 option, which needs a plugin or custom work, never
  outranks one that does not, however well it fits. The panel says why a tool is offered ("Same vendor as
  Snowflake"). `pairs_with` is a hint for ordering and nothing else, and never counts as coverage.
- **Overlapping tools are a decision, not a gap.** When two or more tools in the stack provide the same
  spine capability properly (native or core), the report lists an overlap: the providers best first, a
  lead, and whether the top ones tie. A bundle and its own part in the same stack is one product, not two.
  The lead is the best level, then native over bundled. A tie is called "no clear lead" and never guessed:
  Snowflake and dbt both score 3 for SQL transformation, and the data cannot say which one a team uses.
  Bands are left out, because dozens of tools touch access control and nobody chooses one.
- **Coverage follows the tool you use.** The user can say which tool they use for an overlapping task
  (`use=<capability>:<tool>` in the address). That capability is then scored as the chosen tool's level,
  not the best one owned, so owning Airflow (3) while scheduling with GitHub Actions (2) shows 2. With no
  choice, nothing changes. A choice for a tool that does not provide the task is ignored, one for a tool
  that leaves the stack is dropped with it, and a choice never adds or removes a gap, because a gap needs
  a level of zero and a chosen tool has none. The list sits under the matrix, each tool's row says what it
  is not used for, and the stage strip counts the overlaps in each stage.
- **What overlap cannot yet tell apart.** Some overlaps are alternatives (Snowflake or dbt for SQL
  models), some are layers (dbt orders models, Airflow orders jobs) and some share a label but not a job
  (a cron trigger on a CI runner is not a data scheduler). The scores carry this only in their notes. A
  structured "reach" on each score (own objects, general purpose, CI jobs) would let layers be told from
  alternatives, and is the next step if overlap needs to be smarter.
- **Every tool you pick is on the page.** The matrix drew a row only for a tool with a spine position, so
  the nine tools with only cross-cutting coverage (a catalog, a monitor, an access layer, an IaC tool)
  were a footnote under the chart, and in the medallion lens the cost tool, which has no honest zone
  there, was easy to miss. They now get a row under "Cross-cutting tools": marks in the zones where they
  have coverage, the concerns they cover under the name, and for a tool the lens has no zone for, a note
  saying so, with its cells in the "not shown" fold. The stage strip likewise lists every tool that
  touches a stage, including one another beats on every capability; `covered_by` still means only the
  tools whose coverage is counted. A data test fails if any tool in either lens has neither a row nor a
  reason, so a new record cannot be invisible.


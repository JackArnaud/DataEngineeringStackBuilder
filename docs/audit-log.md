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

# Backlog

## Tools to add

| Tool | Why it matters | Notes |
|---|---|---|
| Snowflake | Requested. Bundle, single contract. | Likely covers `store.olap-serving` (interactive tables); verify. Edition split may need the enterprise-tier flag or separate records. |
| GCP | Requested. Portfolio, like AWS. | Per-service records: BigQuery, Dataflow, Pub/Sub, Composer, Looker and others. |
| Azure | Requested. Portfolio. | Boundary with Fabric and Power BI needs settling first (see Fabric). |
| Microsoft Fabric | Added. Suite that overlaps Azure and Power BI. | Decide whether it is a bundle, a portfolio, or part of Azure before scoring. Its Real-Time Intelligence workload may cover `store.olap-serving`; verify. Also the natural home for Power BI Premium capacity. |
| Oracle DB | Requested. Source and engine, like Postgres. | Exercises `source.oltp` and a heavier `store.warehouse` (Autonomous Data Warehouse). |
| Power BI | Requested. Pro, Premium and Fabric tiers. | First real test of plan tiers: separate records or the enterprise-tier flag. |
| Tableau | Requested. | `serve.bi-viz`; Salesforce owns it, so check how it composes. |
| Salesforce | Added. A SaaS application that holds business data. | Would be the first score for `source.saas-api`. Also a possible home for Tableau. |
| Microsoft Dynamics | Added. Business applications on Dataverse. | Second `source.saas-api` score. Check its link to Fabric before scoring. |

## Known coverage gaps

- **`source.saas-api`** is scored by no record yet. Salesforce and Dynamics close it.
- **`store.olap-serving`** is scored by no record yet. Snowflake and Fabric are the likely candidates.

Both are pinned in `seeds.test.ts`, so a third gap cannot appear unnoticed.

## Records to deepen

- Databricks: Genie and agent tooling are not scored.
- AWS: EMR, Step Functions, Quick, Firehose and Managed Service for Apache Flink are not scored, so AWS has no BI and only Glue for orchestration.
- Lakeflow Connect: only Salesforce, Workday and SQL Server are confirmed GA; other connectors' release states are unchecked.

## Open decisions

- **Plan tiers.** `enterprise-tier` works for a few capabilities (dbt platform) but scales poorly. Power BI and Snowflake will show whether separate records are better.

## Tooling

- **ID immutability check.** Diff the taxonomy ID set against `main` in CI.
- **Taxonomy backlog report** built from `proposed_capabilities`. Two proposals exist today (Postgres CDC source interface, SSMS administration console).

## For the stack builder UI

The first version is built: pick tools, tick needs, ranked gaps, lens switch, receipts, share by link.
Not yet:

- **Compare stacks** side by side, or against a suggested one.
- **Suggest the smallest set of tools** that closes the top gaps, not just tools per gap.
- **Group the ranked gaps** by tier or by stage; a long list is still a long list.
- **A theme toggle.** Light and dark follow the operating system; the tokens already support a toggle.
- **A real end-to-end test in CI.** Component tests run in jsdom; the screenshots and the axe audit
  were run by hand against Chrome and are not automated.
- **Drag to reorder** or pin tools in the matrix.

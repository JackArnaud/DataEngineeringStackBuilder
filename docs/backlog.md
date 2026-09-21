# Backlog

## Tools to add

All the requested tools are scored. Candidates for later:

| Tool | Why it matters | Notes |
|---|---|---|
| Oracle APEX | Oracle's low-code app builder, a `serve.data-apps` candidate. | The docs host refused fetches, so no record exists. Autonomous Database scores `serve.data-apps` at 2 from its workload list; APEX itself is unscored. |
| Other cloud services | The three portfolios are samples. | AWS has no DynamoDB, EventBridge, API Gateway or Lambda; GCP has no Apigee, Cloud Run or Cloud Monitoring; Azure has no HDInsight, Analysis Services, Service Bus or Key Vault. Azure API Management is scored, as bands only. |

## Known coverage gaps

None: every taxonomy capability is scored by at least one record. `seeds.test.ts` pins that the
list of unscored capabilities is empty, so a new capability with no score fails the test.

## Records to deepen

- Databricks: Genie and agent tooling are not scored.
- Fabric: Data Science, Fabric IQ, Copilot, Git integration and the OneLake shortcut transformations are not scored. The dbt job and Eventhouse anomaly detection are preview and skipped.
- Azure: Synapse Analytics is scored from an overview page last updated in 2024; check it against the current docs. The ADF Workflow Orchestration Manager (managed Airflow) stopped accepting new instances on 1 January 2026, so it has no record.
- Azure API Management and Data Fusion: which features belong to which tier or edition was not checked, so neither carries an enterprise-tier constraint.
- dbt: dbt OSS 2.0 was scored from pages that describe dbt in general. Confirm Python models, MetricFlow and state selection against the v2 docs, and decide whether dbt v1 (Postgres and most other adapters) needs its own record.
- Astronomer: the pricing model and plan tiers were not checked. Only its overview page was read.
- Oracle: `govern.masking` is scored 2 for Data Redaction with a note to check the licence, because the docs page states none.
- AWS: EMR Serverless and EMR on EKS are not scored separately from EMR on EC2.
- Lakeflow Connect: only Salesforce, Workday and SQL Server are confirmed GA; other connectors' release states are unchecked.

## Open decisions

- **Plan tiers.** Resolved in practice, not in the schema. Where a tier is a different product bought
  separately, it is a separate record (`power-bi` on Pro versus `fabric-power-bi` on a capacity).
  Where a tier adds a handful of capabilities to one product, it is the `enterprise-tier` constraint
  (Snowflake Horizon, Tableau, dbt platform). No third case has appeared. Capacity-size rules, such
  as Power BI viewers needing a licence below F64, live in the `sku` text because no constraint value
  expresses them.
- **Renamed services.** Google renamed Dataplex to Knowledge Catalog, Composer to Managed Service for
  Apache Airflow and Vertex AI to Gemini Enterprise Agent Platform. Record IDs keep the old names
  because IDs are immutable, and the display names carry both.

## Tooling

- **ID immutability check.** Diff the taxonomy ID set against `main` in CI.
- **Taxonomy backlog report** built from `proposed_capabilities`. Eleven records carry proposals across
  three ideas. "Visual self-service data preparation" comes from six (Power BI, Tableau, Azure and
  Fabric Data Factory, Data Fusion, and by extension Dataflow Gen2), so it is the first candidate for a
  real capability. "Source-side change stream" comes from Postgres, Spanner, Bigtable and Cosmos DB.
  "API gateway for data access" comes from API Management alone.

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

# Backlog

## Tools to add

All the requested tools are scored. Candidates for later:

| Tool | Why it matters | Notes |
|---|---|---|
| Oracle APEX | Oracle's low-code app builder, a `serve.data-apps` candidate. | The docs host refused fetches, so no record exists. Autonomous Database scores `serve.data-apps` at 2 from its workload list; APEX itself is unscored. |
| Azure Synapse Analytics | Overlaps Fabric and the Azure warehouse story. | Microsoft documents Fabric as the successor for new work; decide whether a legacy record is worth it. |
| Google Dataproc, Bigtable, Spanner, AlloyDB | Fill out the GCP portfolio. | The `gcp` portfolio lists 11 services and says it understates the catalogue. |

## Known coverage gaps

None: every taxonomy capability is scored by at least one record. `seeds.test.ts` pins that the
list of unscored capabilities is empty, so a new capability with no score fails the test.

## Records to deepen

- Databricks: Genie and agent tooling are not scored.
- Fabric: Data Science, Fabric IQ, Copilot, Git integration and the OneLake shortcut transformations are not scored. The dbt job and Eventhouse anomaly detection are preview and skipped.
- Azure: the portfolio lists nine services; Synapse, HDInsight, Cosmos DB and Functions are not scored.
- Oracle: `govern.masking` is scored 2 for Data Redaction with a note to check the licence, because the docs page states none.
- AWS: EMR, Step Functions, Quick, Firehose and Managed Service for Apache Flink are not scored, so AWS has no BI and only Glue for orchestration.
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
- **Taxonomy backlog report** built from `proposed_capabilities`. Six records carry proposals today: Postgres (CDC source interface), SSMS (administration console),
  and "visual self-service data preparation" from Power BI, Tableau, Azure Data Factory and Data
  Factory in Fabric. The last one has four independent records asking for it, so it is the first
  candidate for a real taxonomy capability.

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

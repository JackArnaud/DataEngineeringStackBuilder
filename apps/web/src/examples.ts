/**
 * Starting points for an empty stack. Each is a combination people really run, so loading one shows
 * what the tools cover together and what they leave open. `notice` says what to look at, and was
 * written from the gaps the stack actually produces: change the tools and it may go stale.
 */
export interface Example {
  label: string;
  hint: string;
  tools: string[];
  needs?: string[];
  /** What to look at once it is loaded. */
  notice: string;
}

export interface ExampleGroup {
  title: string;
  /** One line on what the group shows. */
  about: string;
  examples: Example[];
}

export const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    title: "The modern warehouse",
    about: "Load data into a warehouse, model it in SQL, and put a tool on top.",
    examples: [
      {
        label: "Snowflake, dbt and GitHub",
        hint: "A warehouse platform, SQL models in version control, and changes shipped through pull requests.",
        tools: ["snowflake", "dbt", "github"],
        needs: ["serve.bi-viz"],
        notice: "You said you need BI, so it is flagged first. Snowflake's masking, policy and anomaly detection need the Enterprise edition, so they show as closable rather than covered.",
      },
      {
        label: "Salesforce to a dashboard",
        hint: "A SaaS application as the source, a warehouse and dbt in the middle, Tableau on top.",
        tools: ["salesforce", "snowflake", "dbt", "tableau"],
        notice: "Every stage is filled, so the gaps are about trust: masking and policy sit behind higher plans, and monitoring is thin at the edges.",
      },
      {
        label: "Oracle estate to a cloud warehouse",
        hint: "GoldenGate captures changes from Oracle, Snowflake stores them, Power BI serves them.",
        tools: ["oracle-database", "oracle-goldengate", "snowflake", "power-bi"],
        notice: "Oracle fills the source stage itself. Policy and anomaly detection are closable on higher Snowflake plans, and monitoring is critical at the edges.",
      },
      {
        label: "dbt platform on Databricks",
        hint: "Hosted dbt over a lakehouse.",
        tools: ["dbt-platform", "databricks"],
        needs: ["ingest.cdc"],
        notice: "Change data capture is ticked as a need. Databricks provides it, so no gap is raised for it. Untick it on the needs tab, or tick one Databricks lacks, to see the difference.",
      },
    ],
  },
  {
    title: "One platform",
    about: "A single vendor covering most of the pipeline, and what it still leaves to you.",
    examples: [
      {
        label: "Databricks lakehouse",
        hint: "One platform, one contract.",
        tools: ["databricks"],
        notice: "A whole Databricks stack leaves no stage empty. The gaps that remain are cross-cutting: contracts, anomaly detection, cost.",
      },
      {
        label: "Databricks with Azure DevOps and Power BI",
        hint: "A lakehouse, shipped through Azure Pipelines, with Power BI as the front end.",
        tools: ["databricks", "azure-devops", "power-bi"],
        notice: "Compare it with the plain lakehouse. Azure Pipelines narrows the environments and access-control gaps at the stages where pipeline code lives; data contracts and anomaly detection stay open.",
      },
      {
        label: "Microsoft Fabric with Purview and GitHub",
        hint: "A SaaS analytics platform, a governance service and version control.",
        tools: ["microsoft-fabric", "azure-purview", "github"],
        notice: "A platform that spans every stage still leaves monitoring, tests and contracts open.",
      },
    ],
  },
  {
    title: "Built from one cloud's services",
    about: "Hand-picked services from a single cloud, joined by you.",
    examples: [
      {
        label: "AWS data lake",
        hint: "Hand-picked services.",
        tools: ["aws-s3", "aws-glue", "aws-athena", "aws-lake-formation"],
        needs: ["serve.bi-viz"],
        notice: "You said you need BI, and Athena is only a query engine, so it is flagged first. Open the gap and add Quick Sight to close it.",
      },
      {
        label: "AWS warehouse with managed Airflow",
        hint: "S3 and Glue feed Redshift, Airflow schedules it, Quick Sight serves it.",
        tools: ["aws-s3", "aws-glue", "aws-redshift", "aws-mwaa", "aws-quick-sight", "aws-lake-formation"],
        notice: "Every stage is covered. Data contracts, catalog, lineage and cost visibility are what is missing.",
      },
      {
        label: "Google Cloud analytics on GitLab",
        hint: "Datastream into BigQuery, Dataform models, Composer schedules, Looker serves, GitLab ships.",
        tools: ["gcp-datastream", "gcp-bigquery", "gcp-dataform", "gcp-composer", "gcp-looker", "gcp-dataplex", "gitlab"],
        notice: "Every stage has a tool, yet masking, data tests, contracts and anomaly detection are still critical. BigQuery's own masking needs the Enterprise edition, so it counts as closable, not covered.",
      },
      {
        label: "Azure data platform with Azure DevOps",
        hint: "Data Factory, a lake, Synapse, Power BI, Purview and Azure Pipelines.",
        tools: ["azure-data-factory", "azure-data-lake-storage", "azure-synapse", "power-bi", "azure-purview", "azure-devops"],
        notice: "Purview covers the catalog and policy at Store, Transform and Serve only, so they stay as moderate gaps at the other stages. Masking is fully open.",
      },
    ],
  },
  {
    title: "Open source and Spark",
    about: "Run the engines yourself, or let a cloud run them for you.",
    examples: [
      {
        label: "Spark and Airflow on Kubernetes",
        hint: "Both engines on your own cluster, object storage on S3, changes shipped with GitLab.",
        tools: ["apache-spark-kubernetes", "apache-airflow-kubernetes", "aws-s3", "gitlab"],
        notice: "Nothing ingests data, and governance is entirely yours to add: catalog and masking come up as critical.",
      },
      {
        label: "Managed Spark and Airflow on AWS",
        hint: "EMR runs Spark, MWAA runs Airflow, Athena queries the lake, GitHub ships the code.",
        tools: ["aws-s3", "aws-emr", "aws-mwaa", "aws-athena", "aws-lake-formation", "github"],
        notice: "The same engines as the Kubernetes stack, but run for you. Ingest is still empty, but Lake Formation lowers the access-control and policy gaps from serious to low.",
      },
    ],
  },
  {
    title: "Real time",
    about: "Events processed as they arrive instead of in batches.",
    examples: [
      {
        label: "Streaming on AWS",
        hint: "Kinesis into Flink and Firehose, landed in S3 and queried with Athena.",
        tools: ["aws-kinesis", "aws-managed-flink", "aws-data-firehose", "aws-s3", "aws-athena"],
        notice: "Streaming pipelines can run without a scheduler, so Orchestrate is a moderate gap here rather than a critical one. Tests and contracts matter more.",
      },
    ],
  },
  {
    title: "Ending in AI",
    about: "The end of the pipeline is where AI meets the data: features for models, predictions for applications, answers for assistants. What is missing upstream shows up there.",
    examples: [
      {
        label: "Features to a model on Google Cloud",
        hint: "BigQuery and Dataform build features, Vertex AI serves the model, Composer schedules, Dataplex governs.",
        tools: ["gcp-bigquery", "gcp-dataform", "gcp-vertex-ai", "gcp-composer", "gcp-dataplex"],
        needs: ["transform.feature-eng", "serve.ml-serving"],
        notice: "Masking, data tests, contracts and anomaly detection are the critical gaps: a model cannot tell bad data from good, and it can just as easily memorise what masking should have hidden.",
      },
      {
        label: "Features to a model on AWS",
        hint: "S3 and Glue prepare data, SageMaker trains and serves, Airflow schedules, Lake Formation governs.",
        tools: ["aws-s3", "aws-glue", "aws-sagemaker", "aws-mwaa", "aws-lake-formation"],
        needs: ["transform.feature-eng", "serve.ml-serving"],
        notice: "Masking is critical here: models can memorise what they read. Open it and read what changes when AI uses the data.",
      },
      {
        label: "Data apps and ML inside Snowflake",
        hint: "Governed data, a semantic layer, Streamlit apps and model serving on one platform, with dbt and GitHub.",
        tools: ["snowflake", "dbt", "github"],
        needs: ["serve.ml-serving", "serve.data-apps", "serve.semantic-layer"],
        notice: "The platform meets every need, so what is left is trust: tests, lineage, masking and access. Those decide whether an assistant's answer can be relied on.",
      },
    ],
  },
];

export const EXAMPLES: Example[] = EXAMPLE_GROUPS.flatMap((g) => g.examples);

/** Starting points for an empty stack. Each is a real combination someone might run. */
export interface Example {
  label: string;
  hint: string;
  tools: string[];
  needs?: string[];
}

export const EXAMPLES: Example[] = [
  { label: "Postgres and dbt", hint: "A small analytics stack on one database", tools: ["postgres", "dbt-core"] },
  { label: "Databricks lakehouse", hint: "One platform, one contract", tools: ["databricks"] },
  { label: "AWS data lake", hint: "Hand-picked services", tools: ["aws-s3", "aws-glue", "aws-athena", "aws-lake-formation"] },
  { label: "dbt platform on Databricks", hint: "Hosted dbt over a lakehouse", tools: ["dbt-platform", "databricks"], needs: ["ingest.cdc"] },
];

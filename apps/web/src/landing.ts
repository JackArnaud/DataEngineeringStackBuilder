/**
 * The guided start: a short run of choice screens that build a stack before any guidance is shown.
 * It follows the pipeline in order, from where the data starts to how changes are shipped, then asks
 * what the stack has to do. Every tile is a real record and every need a real capability; a test
 * checks both, so a rename in the data cannot leave a dead tile here.
 */
export interface ToolStep {
  id: string;
  title: string;
  /** One line under the title, saying what to pick and when to skip. */
  help: string;
  /** Record ids to offer, in the order shown. */
  tiles: string[];
}

export const SOURCES_STEP: ToolStep = {
  id: "sources",
  title: "Where does your data start?",
  help: "Pick the systems your data comes from. Skip this if they sit outside what you are building, which is true of most stacks.",
  tiles: ["postgres", "oracle-database", "salesforce", "dynamics-365"],
};

/** Portfolio ids offered on the platform screen. Choosing one leads to a screen of its services. */
export const CLOUDS = ["aws", "gcp", "azure"];

export const PLATFORM_STEP: ToolStep = {
  id: "platform",
  title: "Where will it be stored and processed?",
  help: "Pick a data platform, a cloud to assemble services from, or an open-source engine. You can pick several.",
  tiles: ["snowflake", "databricks", "microsoft-fabric", "apache-spark", "apache-spark-kubernetes"],
};

export const TRANSFORM_STEP: ToolStep = {
  id: "transform",
  title: "How do you model and schedule the work?",
  help: "Pick the frameworks you use on top of your platform. Skip this if your platform's own tools are enough.",
  tiles: ["dbt", "dbt-core", "dbt-platform", "apache-airflow", "apache-airflow-kubernetes", "astronomer-astro"],
};

export const SERVE_STEP: ToolStep = {
  id: "serve",
  title: "How do people use the data?",
  help: "Pick the dashboard and reporting tools in use. Skip this if nothing consumes the data yet.",
  tiles: ["power-bi", "tableau", "gcp-looker", "aws-quick-sight"],
};

export const SHIP_STEP: ToolStep = {
  id: "ship",
  title: "How do you keep changes under control?",
  help: "Pick where your code lives and how it is tested and shipped.",
  tiles: ["github", "gitlab", "azure-devops"],
};

export const TOOL_STEPS: ToolStep[] = [SOURCES_STEP, PLATFORM_STEP, TRANSFORM_STEP, SERVE_STEP, SHIP_STEP];

/** A plain-language outcome that stands for one or more capabilities the stack must provide. */
export interface NeedCard {
  id: string;
  label: string;
  help: string;
  needs: string[];
}

export const NEED_CARDS: NeedCard[] = [
  { id: "dashboards", label: "Dashboards and reports", help: "Business users explore the data themselves.", needs: ["serve.bi-viz"] },
  { id: "metrics", label: "One set of metric definitions", help: "Revenue means the same thing in every tool.", needs: ["serve.semantic-layer"] },
  { id: "ml", label: "Machine learning in production", help: "Features built once, models served to applications.", needs: ["transform.feature-eng", "serve.ml-serving"] },
  { id: "apps", label: "Applications built on the data", help: "Interactive tools and data apps, not just reports.", needs: ["serve.data-apps"] },
  { id: "fast", label: "Fast answers for many users", help: "Aggregate queries that stay quick under load.", needs: ["store.olap-serving"] },
  { id: "realtime", label: "Real-time events", help: "Data processed as it arrives, not overnight.", needs: ["ingest.stream-ingest", "transform.stream-processing"] },
  { id: "cdc", label: "Follow changes in databases", help: "Copy row-level changes instead of reloading tables.", needs: ["ingest.cdc"] },
  { id: "load", label: "Load data from applications and files", help: "Scheduled bulk pulls from the systems that hold it.", needs: ["ingest.batch-extract"] },
  { id: "reverse", label: "Send results back to business tools", help: "Push modelled data into the CRM or other systems.", needs: ["ingest.reverse-etl"] },
  { id: "sql", label: "Model the data in SQL", help: "Transformations written as SQL, kept in version control.", needs: ["transform.sql-transform"] },
  { id: "schedule", label: "Jobs that run in order, on time", help: "Dependencies, retries and schedules, not a script on someone's laptop.", needs: ["orchestrate.scheduling", "orchestrate.dependency-dag"] },
  { id: "release", label: "Tested, reviewed releases", help: "Changes are checked and promoted automatically.", needs: ["orchestrate.ci-cd"] },
];

/** A card is on when the stack already needs everything it stands for, so the needs tab and the cards agree. */
export const cardIsOn = (card: NeedCard, needs: string[]): boolean => card.needs.every((n) => needs.includes(n));

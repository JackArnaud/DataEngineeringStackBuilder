import type { Resource } from "@compile";

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

/**
 * One question about the project, one pick among a few plain answers. The ids of the answer that
 * confirms a fact (`solo`, `none`, `exploration`, below) are a small vocabulary of their own, kept
 * in sync with `state.ts`'s `PROFILE_TAG_WHEN` by hand: state parsing never imports this UI content,
 * so a shared link's meaning does not depend on this file's wording.
 */
export interface ProfileOption {
  id: string;
  label: string;
}

export interface ProfileQuestion {
  /** Matches a key of `StackState["profile"]`. */
  key: "team" | "sensitivity" | "stakes";
  title: string;
  help: string;
  options: ProfileOption[];
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    key: "team",
    title: "How many people work on this?",
    help: "Shapes how much of the governance below actually earns its place.",
    options: [
      { id: "solo", label: "Just me" },
      { id: "small-team", label: "A small team" },
      { id: "multiple-teams", label: "Multiple teams depend on it" },
    ],
  },
  {
    key: "sensitivity",
    title: "Does the data include anything sensitive or regulated?",
    help: "Shapes how much masking, access control and policy matter here.",
    options: [
      { id: "none", label: "No personal, financial or health data" },
      { id: "some", label: "Some regulated data" },
      { id: "heavy", label: "Heavily regulated, such as finance or health" },
    ],
  },
  {
    key: "stakes",
    title: "What happens with this data?",
    help: "Shapes how much testing and monitoring matter here.",
    options: [
      { id: "exploration", label: "Exploration or a prototype" },
      { id: "decisions", label: "Real decisions get made from it" },
      { id: "customer-facing", label: "Customers or revenue depend on it" },
    ],
  },
];

/**
 * How much the pipeline moves and runs each month, in GB — distinct from `profile.team`
 * (headcount): this is about data volume and traffic, and it drives the cost estimate rather than
 * dampening gap severity. At 10TB/month or more (`tiers.ts`'s `ENTERPRISE_TIER_VOLUME_GB`), a tool
 * with an enterprise-tier-only capability is also assumed to be on that plan. This used to be a
 * three-bucket "Scale" question (Prototype/Production/Scale); a real, continuous number replaces
 * it so cost reflects this pipeline's own volume, not a wide bucket average, and so the underlying
 * cost model can interpolate between real, sourced checkpoints instead of picking one of three.
 *
 * The control is a log-scale slider: cost varies by orders of magnitude with volume, so a linear
 * slider would waste most of its length on the bottom decade. `VOLUME_SLIDER_STEPS` positions map
 * exponentially between `VOLUME_MIN_GB` and `VOLUME_MAX_GB`.
 */
export const VOLUME_MIN_GB = 1;
/** 1 PB/month, in GB (1024^2), matching the top checkpoint every cost-scored tool was researched at. */
export const VOLUME_MAX_GB = 1_048_576;
export const VOLUME_SLIDER_STEPS = 1000;
/** Where the slider starts before it has been dragged — about 100GB/month, a plausible starting point. */
export const DEFAULT_VOLUME_GB = 100;

/** A 0-`VOLUME_SLIDER_STEPS` slider position to a volume in GB, log-scaled. */
export function volumeFromSlider(pos: number): number {
  const t = Math.min(Math.max(pos, 0), VOLUME_SLIDER_STEPS) / VOLUME_SLIDER_STEPS;
  return Math.round(VOLUME_MIN_GB * (VOLUME_MAX_GB / VOLUME_MIN_GB) ** t);
}

/** The inverse of `volumeFromSlider`, for driving the control's own position from a stored volume. */
export function sliderFromVolume(volumeGb: number): number {
  const clamped = Math.min(Math.max(volumeGb, VOLUME_MIN_GB), VOLUME_MAX_GB);
  return Math.round((Math.log(clamped / VOLUME_MIN_GB) / Math.log(VOLUME_MAX_GB / VOLUME_MIN_GB)) * VOLUME_SLIDER_STEPS);
}

/** A volume in GB, formatted to whichever unit reads most naturally at that size. */
export function formatVolume(volumeGb: number): string {
  if (volumeGb < 1000) return `${Math.round(volumeGb)} GB/month`;
  if (volumeGb < VOLUME_MAX_GB) {
    const tb = volumeGb / 1024;
    return `${tb < 10 ? tb.toFixed(1) : Math.round(tb)} TB/month`;
  }
  return `${(volumeGb / VOLUME_MAX_GB).toFixed(2)} PB/month`;
}

/** A plain-language resource the guided start's resources step can tick. */
export interface ResourceCard {
  id: Resource;
  label: string;
  help: string;
}

export const RESOURCE_CARDS: ResourceCard[] = [
  { id: "prefer-oss", label: "Prefer free and open-source", help: "Suggestions favour an open-source tool over an equally good paid one." },
  { id: "procurement", label: "Can sign a vendor contract", help: "Left unticked, suggestions favour tools you can start on without a sales conversation." },
];

import type { ProfileTag, RenderModel, Resource, Scale } from "@compile";

/** The guided start's profile answers, one per question. Which answer confirms which fact is below. */
export interface ProfileAnswers {
  team?: string;
  sensitivity?: string;
  stakes?: string;
}

/**
 * Everything the user has chosen, and nothing else. It lives in the URL, so a stack is shared by
 * copying the address: `?tools=dbt-core,postgres&needs=ingest.cdc`.
 */
export interface StackState {
  tools: string[];
  needs: string[];
  /** Cross-cutting capabilities the user set aside as not relevant to their stack. */
  skip: string[];
  /** Spine capability to the tool the user uses for it, where more than one tool provides it. */
  use: Record<string, string>;
  /** The guided start's profile answers; pre-fills `skip` for capabilities that answer confirms. */
  profile: ProfileAnswers;
  /** What the guided start's resources step said the person already has; reorders suggestions only. */
  resources: Resource[];
  /** Tools the user has confirmed are on the tier named by that tool's `tier_name`. */
  tiers: string[];
  /** How much the pipeline moves and runs, for the cost estimate. Unanswered until asked. */
  scale?: Scale;
}

const PROFILE_KEYS = ["team", "sensitivity", "stakes"] as const;
const RESOURCE_TAGS: Resource[] = ["prefer-oss", "procurement"];
const SCALES: Scale[] = ["prototype", "production", "scale"];

/**
 * Which answer to each profile question confirms the fact a capability's `skip_when` is about.
 * Kept here, not in `landing.ts`, so parsing a shared link never depends on the guided start's
 * own wording — only on the answer ids, which are part of this module's own small vocabulary.
 */
const PROFILE_TAG_WHEN: Record<(typeof PROFILE_KEYS)[number], { tag: ProfileTag; answers: string[] }> = {
  team: { tag: "team-size", answers: ["solo", "small-team"] },
  sensitivity: { tag: "sensitivity", answers: ["none"] },
  stakes: { tag: "stakes", answers: ["exploration"] },
};

/** The profile tags the given answers confirm, in a fixed order. */
export function profileTags(profile: ProfileAnswers): ProfileTag[] {
  return PROFILE_KEYS.filter((k) => profile[k] && PROFILE_TAG_WHEN[k].answers.includes(profile[k]!)).map((k) => PROFILE_TAG_WHEN[k].tag);
}

/**
 * Band capabilities whose `skip_when` the profile answers have now confirmed. Every one of these
 * still shows up in the ordinary "set aside" fold, and can be brought back by hand at any time —
 * this only pre-fills the same decision the user could make manually, one capability at a time.
 */
export function profileSkips(model: RenderModel, profile: ProfileAnswers): string[] {
  const tags = new Set(profileTags(profile));
  if (tags.size === 0) return [];
  return model.capabilities.filter((c) => c.kind === "band" && c.impact?.profile_tag && tags.has(c.impact.profile_tag)).map((c) => c.id);
}

/** A portfolio is not a thing you buy; you pick its services. */
export const isSelectable = (model: RenderModel, id: string): boolean => model.tools.some((t) => t.id === id && t.kind !== "portfolio");

const canonical = (items: string[]): string[] => [...new Set(items)].sort();

export function emptyState(_model: RenderModel): StackState {
  return { tools: [], needs: [], skip: [], use: {}, profile: {}, resources: [], tiers: [] };
}

const isScale = (v: string): v is Scale => (SCALES as string[]).includes(v);

/** Read a query string against the model, quietly dropping anything that no longer exists. */
export function parseState(search: string, model: RenderModel): StackState {
  const params = new URLSearchParams(search);
  const list = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const spine = new Set(model.capabilities.filter((c) => c.kind === "spine").map((c) => c.id));
  const band = new Set(model.capabilities.filter((c) => c.kind === "band").map((c) => c.id));
  const tools = canonical(list("tools").filter((id) => isSelectable(model, id)));

  const profile: ProfileAnswers = {};
  for (const pair of list("profile")) {
    const [k, v] = pair.split(":") as [string, string | undefined];
    if (v && (PROFILE_KEYS as readonly string[]).includes(k)) profile[k as (typeof PROFILE_KEYS)[number]] = v;
  }
  const resources = canonical(list("resources").filter((t): t is Resource => (RESOURCE_TAGS as string[]).includes(t))) as Resource[];
  const tiers = canonical(list("tiers").filter((id) => isSelectable(model, id)));
  const scaleParam = params.get("scale");
  const scale = scaleParam && isScale(scaleParam) ? scaleParam : undefined;

  return {
    tools,
    needs: canonical(list("needs").filter((id) => spine.has(id))),
    // Set aside by hand, plus whatever the profile answers already confirm is not relevant here.
    skip: canonical([...list("skip").filter((id) => band.has(id)), ...profileSkips(model, profile)]),
    // `use=<capability>:<tool>`, kept only when it names a spine capability and a tool that is in the stack.
    use: Object.fromEntries(
      list("use")
        .map((pair) => pair.split(":") as [string, string])
        .filter(([cap, tool]) => spine.has(cap) && tools.includes(tool)),
    ),
    profile,
    resources,
    tiers,
    ...(scale && { scale }),
  };
}

/** The shortest query string that reproduces a state; defaults are left out. */
export function serializeState(state: StackState, _model: RenderModel): string {
  const params = new URLSearchParams();
  if (state.tools.length) params.set("tools", canonical(state.tools).join(","));
  if (state.needs.length) params.set("needs", canonical(state.needs).join(","));
  if (state.skip.length) params.set("skip", canonical(state.skip).join(","));
  const use = Object.entries(state.use).sort(([a], [b]) => a.localeCompare(b));
  if (use.length) params.set("use", use.map(([cap, tool]) => `${cap}:${tool}`).join(","));
  const profile = PROFILE_KEYS.filter((k) => state.profile[k]).map((k) => `${k}:${state.profile[k]}`);
  if (profile.length) params.set("profile", profile.join(","));
  if (state.resources.length) params.set("resources", canonical(state.resources).join(","));
  if (state.tiers.length) params.set("tiers", canonical(state.tiers).join(","));
  if (state.scale) params.set("scale", state.scale);
  // Commas are the list separator and are safe in a query string; keep the address readable.
  const query = params.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
  return query ? `?${query}` : "";
}

export const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : canonical([...list, id]));
export const add = (list: string[], ...ids: string[]): string[] => canonical([...list, ...ids]);

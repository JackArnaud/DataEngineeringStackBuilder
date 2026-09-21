import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import type { Dataset } from "./dataset.js";
import { roleOf } from "./derivation.js";
import { allCells, place } from "./lens.js";
import { bandStages } from "./scope.js";
import { capabilityKind, compareSemver, criticalityOf } from "./taxonomy.js";
import type { Derivation, Issue, Lens, Severity, Taxonomy, ToolRecord } from "./types.js";

/** Collects issues so the check functions stay free of array plumbing. */
class Sink {
  readonly issues: Issue[] = [];

  add(severity: Severity, code: string, file: string, pointer: string, message: string): void {
    this.issues.push({ severity, code, file, path: pointer, message });
  }
  error(code: string, file: string, pointer: string, message: string): void {
    this.add("error", code, file, pointer, message);
  }
  warn(code: string, file: string, pointer: string, message: string): void {
    this.add("warning", code, file, pointer, message);
  }
}

// ---------------------------------------------------------------- schema errors

function schemaIssues(errors: ErrorObject[] | null | undefined, file: string, sink: Sink): void {
  const seen = new Set<string>();
  for (const e of errors ?? []) {
    // "must match then/else schema" only restates the inner error that already explains why.
    if (e.keyword === "if") continue;

    let pointer = e.instancePath;
    let message = e.message ?? "is invalid";
    const params = e.params as Record<string, unknown>;

    switch (e.keyword) {
      case "required":
        message = `missing required property "${String(params.missingProperty)}"`;
        break;
      case "unevaluatedProperties":
        pointer += `/${String(params.unevaluatedProperty)}`;
        message = `unknown property "${String(params.unevaluatedProperty)}"`;
        break;
      case "additionalProperties":
        pointer += `/${String(params.additionalProperty)}`;
        message = `unknown property "${String(params.additionalProperty)}"`;
        break;
      case "enum":
        message = `must be one of: ${(params.allowedValues as unknown[]).join(", ")}`;
        if (pointer.endsWith("/delivery")) {
          message += " (level 2 and 3 must be native or bundled; level 1 must not be native)";
        }
        break;
      case "const":
        message = `must be ${JSON.stringify(params.allowedValue)}`;
        break;
      case "anyOf":
        if (pointer === "") message = "a tool needs at least one coverage entry or one band entry";
        break;
    }

    const key = `${pointer}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sink.error("schema", file, pointer, message);
  }
}

// -------------------------------------------------------------------- taxonomy

function checkTaxonomy(t: Taxonomy, file: string, sink: Sink): void {
  const stageIds = new Set(t.stages.map((s) => s.id));
  const bandIds = new Set(t.bands.map((b) => b.id));

  const seenGroups = new Set<string>();
  for (const [kind, groups] of [["stages", t.stages], ["bands", t.bands]] as const) {
    groups.forEach((g, i) => {
      if (seenGroups.has(g.id)) {
        sink.error("group-id-duplicate", file, `/${kind}/${i}/id`, `"${g.id}" is used by more than one stage or band; capability prefixes would be ambiguous`);
      }
      seenGroups.add(g.id);
    });
  }

  // Every stage and cross-cutting capability that can surface as a gap must say, in plain words, why it matters.
  t.stages.forEach((s, i) => {
    if (s.criticality > 0 && !s.impact) sink.error("impact-missing", file, `/stages/${i}/impact`, `stage "${s.id}" can be a gap, so it needs an impact: what goes wrong without it, and an example`);
  });
  for (const [id, cap] of Object.entries(t.capabilities)) {
    if (cap.status === "active" && !cap.impact) sink.error("impact-missing", file, `/capabilities/${id}/impact`, `"${id}" can be a gap, so it needs an impact: what goes wrong without it, and an example`);
  }

  for (const [id, cap] of Object.entries(t.capabilities)) {
    const ptr = `/capabilities/${id}`;
    const prefix = id.slice(0, id.indexOf("."));
    if (!stageIds.has(prefix) && !bandIds.has(prefix)) {
      sink.error("capability-prefix-unknown", file, ptr, `"${prefix}" is neither a stage nor a band`);
    }
    for (const s of cap.successors ?? []) {
      if (s === id) sink.error("successor-self", file, `${ptr}/successors`, "a capability cannot succeed itself");
      else if (!Object.hasOwn(t.capabilities, s)) sink.error("successor-unknown", file, `${ptr}/successors`, `successor "${s}" is not in the taxonomy`);
    }
  }

  // A successor chain that loops would make a fan-out migration run forever.
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of t.capabilities[id]?.successors ?? []) {
      if (!Object.hasOwn(t.capabilities, next) || next === id) continue;
      if (state.get(next) === 1) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          sink.error("successor-cycle", file, `/capabilities/${next}`, `successor chain loops: ${[...cycle, next].join(" -> ")}`);
        }
      } else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of Object.keys(t.capabilities)) if (!state.has(id)) visit(id);

  // Criticality: every band x stage cell must be present, or gaps in it can't be ranked.
  const crit = t.criticality;
  for (const band of bandIds) {
    const row = crit.bands[band];
    if (!row) {
      sink.error("criticality-cell-missing", file, "/criticality/bands", `no weights for band "${band}"`);
      continue;
    }
    for (const stage of stageIds) {
      if (row.stages[stage] === undefined) {
        sink.error("criticality-cell-missing", file, `/criticality/bands/${band}/stages`, `no weight for ${band} x ${stage}`);
      }
    }
    for (const stage of Object.keys(row.stages)) {
      if (!stageIds.has(stage)) sink.error("criticality-stage-unknown", file, `/criticality/bands/${band}/stages/${stage}`, `"${stage}" is not a stage`);
    }
  }
  for (const band of Object.keys(crit.bands)) {
    if (!bandIds.has(band)) sink.error("criticality-band-unknown", file, `/criticality/bands/${band}`, `"${band}" is not a band`);
  }

  const seenOverrides = new Set<string>();
  crit.overrides.forEach((o, i) => {
    const ptr = `/criticality/overrides/${i}`;
    if (capabilityKind(t, o.capability) !== "band") {
      sink.error("criticality-override-target", file, `${ptr}/capability`, `"${o.capability}" is not a band capability; only band cells carry criticality`);
    }
    if (!stageIds.has(o.stage)) sink.error("criticality-stage-unknown", file, `${ptr}/stage`, `"${o.stage}" is not a stage`);
    const key = `${o.capability}@${o.stage}`;
    if (seenOverrides.has(key)) sink.error("criticality-override-duplicate", file, ptr, `${key} is overridden twice`);
    seenOverrides.add(key);
  });
}

// ------------------------------------------------------------------ derivation

function checkDerivation(d: Derivation, file: string, t: Taxonomy, toolSchema: object, sink: Sink): void {
  const roleIds = new Set<string>();
  d.roles.forEach((r, i) => {
    if (roleIds.has(r.id)) sink.error("derivation-role-duplicate", file, `/roles/${i}/id`, `role "${r.id}" is listed twice`);
    roleIds.add(r.id);
  });

  // The role a tool may be manually overridden to must be the same closed set the derivation uses.
  const schemaRoles = (toolSchema as { $defs?: { presentation?: { properties?: { role?: { enum?: string[] } } } } }).$defs?.presentation?.properties?.role?.enum;
  if (schemaRoles && [...roleIds].sort().join(",") !== [...schemaRoles].sort().join(",")) {
    sink.error("role-vocabulary-mismatch", file, "/roles", `roles must match the role enum in tool.schema.json (${schemaRoles.join(", ")})`);
  }

  const stageIds = new Set(t.stages.map((s) => s.id));
  const bandIds = new Set(t.bands.map((b) => b.id));
  const seen = new Set<string>();
  d.role_affinity.forEach((r, i) => {
    const ptr = `/role_affinity/${i}`;
    if (seen.has(r.match)) sink.error("derivation-match-duplicate", file, `${ptr}/match`, `"${r.match}" has more than one rule`);
    seen.add(r.match);

    const resolves = r.match.endsWith(".*")
      ? stageIds.has(r.match.slice(0, -2)) || bandIds.has(r.match.slice(0, -2))
      : Object.hasOwn(t.capabilities, r.match);
    if (!resolves) sink.error("derivation-match-unresolved", file, `${ptr}/match`, `"${r.match}" matches no capability, so the rule is stale`);
    if (!roleIds.has(r.role)) sink.error("derivation-role-unknown", file, `${ptr}/role`, `"${r.role}" is not one of the roles`);
  });

  // Invariant: every capability resolves to a role, so a new capability always gets one.
  for (const id of Object.keys(t.capabilities)) {
    if (roleOf(d, id) === undefined) sink.error("derivation-capability-unmapped", file, "/role_affinity", `"${id}" resolves to no role`);
  }

  if (d.archetype.specialist_max_stages >= d.archetype.end_to_end_min_stages) {
    sink.error("archetype-thresholds", file, "/archetype", "specialist_max_stages must be below end_to_end_min_stages, or no tool could be a stage-platform");
  }
}

// ---------------------------------------------------------------------- lenses

function checkLens(lens: Lens, file: string, t: Taxonomy, sink: Sink): void {
  if (lens.id !== path.posix.basename(file, ".json")) {
    sink.error("lens-id-mismatch", file, "/id", `id "${lens.id}" must match the file name`);
  }

  const stageIds = new Set(t.stages.map((s) => s.id));
  const bandIds = new Set(t.bands.map((b) => b.id));
  const zones = new Set(lens.zones);
  const checkZones = (placement: unknown, pointer: string): void => {
    if (!Array.isArray(placement)) return;
    for (const z of placement as string[]) {
      if (!zones.has(z)) sink.error("lens-zone-unknown", file, pointer, `zone "${z}" is not declared in this lens's zones`);
    }
  };

  for (const [stage, placement] of Object.entries(lens.defaults)) {
    if (!stageIds.has(stage)) sink.error("lens-stage-unknown", file, `/defaults/${stage}`, `"${stage}" is not a stage`);
    checkZones(placement, `/defaults/${stage}`);
  }

  const seen = new Set<string>();
  lens.overrides.forEach((o, i) => {
    const ptr = `/overrides/${i}`;
    if (seen.has(o.match)) sink.error("lens-override-duplicate", file, `${ptr}/match`, `"${o.match}" is matched by more than one override`);
    seen.add(o.match);

    const resolves = o.match.endsWith(".*")
      ? stageIds.has(o.match.slice(0, -2)) || bandIds.has(o.match.slice(0, -2))
      : Object.hasOwn(t.capabilities, o.match);
    if (!resolves) sink.error("lens-override-unresolved", file, `${ptr}/match`, `"${o.match}" matches no capability, so the rule is stale`);
    checkZones(o.zones, `${ptr}/zones`);
  });

  // Invariant: every capability cell maps to a zone or is explicitly unmapped.
  const unplaced = new Map<string, number>();
  for (const cell of allCells(t)) {
    if (place(lens, cell) === undefined) unplaced.set(cell.stage, (unplaced.get(cell.stage) ?? 0) + 1);
  }
  for (const [stage, n] of unplaced) {
    sink.error("lens-stage-unmapped", file, "/defaults", `stage "${stage}" has no default, leaving ${n} capability cells with no zone and not marked unmapped`);
  }

  // Invariant: gaps survive lens changes. A lens that drops what it cannot place would hide a gap
  // the grid found, so `drop` is only allowed when nothing it leaves unmapped could ever be one.
  // A spine capability could be a need, a band cell with weight above 0 could be a gap, and a
  // stage with criticality above 0 could be empty.
  if (lens.unmapped === "drop") {
    const hideable: string[] = [];
    // Whole stages first: they are the most telling thing to report.
    for (const stage of t.stages) {
      if (lens.defaults[stage.id] === "unmapped" && stage.criticality > 0) hideable.push(`stage ${stage.id}`);
    }
    for (const cell of allCells(t)) {
      const p = place(lens, cell);
      if (p?.kind !== "unmapped") continue;
      const couldBeGap = capabilityKind(t, cell.capability) === "spine" || criticalityOf(t, cell.capability, cell.stage) > 0;
      if (couldBeGap) hideable.push(`${cell.capability}@${cell.stage}`);
    }
    if (hideable.length > 0) {
      const sample = hideable.slice(0, 3).join(", ");
      sink.error("lens-drop-hides-gap", file, "/unmapped", `"drop" would hide ${hideable.length} cells that can be gaps (${sample}${hideable.length > 3 ? ", ..." : ""}); use "rail" so a gap never vanishes`);
    }
  }
}

// ----------------------------------------------------------------------- tools

function checkStatus(t: Taxonomy, id: string, file: string, pointer: string, sink: Sink): void {
  const cap = t.capabilities[id];
  if (cap?.status === "deprecated") {
    sink.warn("capability-deprecated", file, pointer, `"${id}" is deprecated`);
  } else if (cap?.status === "superseded_by") {
    sink.warn("capability-superseded", file, pointer, `"${id}" is superseded by ${(cap.successors ?? []).join(", ")}; this record needs a ${cap.migration} migration`);
  }
}

function checkTool(rec: ToolRecord, file: string, t: Taxonomy, lenses: Map<string, Lens>, sink: Sink): void {
  if (path.posix.basename(file, ".json") !== rec.id) {
    sink.error("tool-filename-mismatch", file, "/id", `id "${rec.id}" must match the file name so records can be found by ID`);
  }

  const cmp = compareSemver(rec.taxonomy_version, t.taxonomy_version);
  if (cmp > 0) {
    sink.error("taxonomy-version-ahead", file, "/taxonomy_version", `${rec.taxonomy_version} is newer than the taxonomy (${t.taxonomy_version})`);
  } else if (compareSemver(rec.taxonomy_version, t.taxonomy_version, 2) < 0) {
    // Only major.minor lag matters: a patch changes weights and wording, never which capabilities exist.
    sink.warn("needs-review", file, "/taxonomy_version", `scored against taxonomy ${rec.taxonomy_version}, current is ${t.taxonomy_version}; absent capabilities may be unscored rather than zero`);
  }

  const stageIds = new Set(t.stages.map((s) => s.id));
  const homes = new Set([...stageIds, ...t.bands.map((b) => b.id)]);

  (rec.proposed_capabilities ?? []).forEach((p, i) => {
    if (!homes.has(p.home)) sink.error("proposal-home-unknown", file, `/proposed_capabilities/${i}/home`, `"${p.home}" is neither a stage nor a band`);
    if (p.nearest_existing !== undefined && !Object.hasOwn(t.capabilities, p.nearest_existing)) {
      sink.error("proposal-nearest-unknown", file, `/proposed_capabilities/${i}/nearest_existing`, `"${p.nearest_existing}" is not in the taxonomy`);
    }
  });

  (rec.lens_overrides ?? []).forEach((o, i) => {
    const lens = lenses.get(o.lens);
    if (!lens) {
      sink.error("lens-override-lens-unknown", file, `/lens_overrides/${i}/lens`, `no lens "${o.lens}"`);
      return;
    }
    for (const z of o.zones) {
      if (!lens.zones.includes(z)) sink.error("lens-override-zone-unknown", file, `/lens_overrides/${i}/zones`, `zone "${z}" is not in lens "${o.lens}"`);
    }
  });

  if (rec.kind !== "tool") return;

  for (const [id, score] of Object.entries(rec.coverage ?? {})) {
    const ptr = `/coverage/${id}`;
    const kind = capabilityKind(t, id);
    if (kind === undefined) sink.error("capability-unknown", file, ptr, `"${id}" is not in the taxonomy`);
    else if (kind === "band") sink.error("capability-wrong-kind", file, ptr, `"${id}" is a band capability; record it under bands`);
    else checkStatus(t, id, file, ptr, sink);
    if (score.inherited) sink.warn("inherited-unscored", file, ptr, "copied by a taxonomy migration and not yet re-scored");
  }

  const claimed = new Map<string, number>();
  (rec.bands ?? []).forEach((entry, i) => {
    const ptr = `/bands/${i}`;
    const kind = capabilityKind(t, entry.band);
    if (kind === undefined) sink.error("capability-unknown", file, `${ptr}/band`, `"${entry.band}" is not in the taxonomy`);
    else if (kind === "spine") sink.error("capability-wrong-kind", file, `${ptr}/band`, `"${entry.band}" is a spine capability; record it under coverage`);
    else checkStatus(t, entry.band, file, `${ptr}/band`, sink);
    if (entry.inherited) sink.warn("inherited-unscored", file, ptr, "copied by a taxonomy migration and not yet re-scored");

    for (const stage of bandStages(rec, entry)) {
      if (!stageIds.has(stage)) {
        sink.error("scope-stage-unknown", file, `${ptr}/scope`, `"${stage}" is not a stage`);
        continue;
      }
      const key = `${entry.band}@${stage}`;
      const first = claimed.get(key);
      if (first !== undefined) {
        sink.error("band-scope-overlap", file, ptr, `${entry.band} at ${stage} is already scored by /bands/${first}; one score per band capability per stage`);
      } else claimed.set(key, i);
    }
  });
}

// ------------------------------------------------------------------ composition

function checkComposition(records: { rec: ToolRecord; file: string }[], sink: Sink): void {
  const byId = new Map<string, { rec: ToolRecord; file: string }>();
  for (const r of records) {
    const first = byId.get(r.rec.id);
    if (first) sink.error("tool-duplicate-id", r.file, "/id", `id "${r.rec.id}" is already used by ${first.file}`);
    else byId.set(r.rec.id, r);
  }

  const children = new Map<string, string[]>();
  for (const { rec, file } of byId.values()) {
    (rec.pairs_with ?? []).forEach((id, i) => {
      if (!byId.has(id)) sink.warn("pairs-with-unknown", file, `/pairs_with/${i}`, `no record for "${id}" yet`);
    });
    if (rec.kind === "tool") continue;

    const members: string[] = [];
    rec.includes.forEach((id, i) => {
      if (id === rec.id) sink.error("include-self", file, `/includes/${i}`, `${rec.kind} cannot include itself`);
      else if (!byId.has(id)) sink.error("include-unknown", file, `/includes/${i}`, `no record for "${id}"; a ${rec.kind}'s coverage derives from its parts, so every part must exist`);
      else members.push(id);
    });
    children.set(rec.id, members);
  }

  // A composition loop has no well-defined derived coverage.
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of children.get(id) ?? []) {
      if (state.get(next) === 1) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          sink.error("include-cycle", byId.get(id)!.file, "/includes", `composition loops: ${[...cycle, next].join(" -> ")}`);
        }
      } else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of children.keys()) if (!state.has(id)) visit(id);
}

// ------------------------------------------------------------------------ main

/**
 * Validate a whole dataset. Schema checks come first; semantic checks only run on files
 * whose structure is sound, so one malformed record can't cascade into noise.
 */
export function validateDataset(ds: Dataset): Issue[] {
  const sink = new Sink();
  sink.issues.push(...ds.loadIssues);

  // strictRequired is off because if/then rules legitimately require properties that the
  // parent schema declares. The rules that use it are covered by tests instead.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const toolSchemaId = (ds.schemas.tool as { $id: string }).$id;
  ajv.addSchema(ds.schemas.tool);
  const validateTaxonomy = ajv.compile(ds.schemas.taxonomy);
  const validateLens = ajv.compile(ds.schemas.lens);
  const validateDerivation = ajv.compile(ds.schemas.derivation);
  const validateToolKind = (kind: unknown): ValidateFunction => {
    const def = kind === "tool" || kind === "bundle" || kind === "portfolio" ? kind : "common";
    return ajv.getSchema(`${toolSchemaId}#/$defs/${def}`)!;
  };

  if (!ds.taxonomy) {
    if (!ds.loadIssues.some((i) => i.file.endsWith("taxonomy.json"))) {
      sink.error("file-missing", "data/taxonomy.json", "", "taxonomy.json not found");
    }
    return sink.issues;
  }
  if (!validateTaxonomy(ds.taxonomy.data)) {
    schemaIssues(validateTaxonomy.errors, ds.taxonomy.file, sink);
    return sink.issues; // everything else is checked against the taxonomy
  }
  const taxonomy = ds.taxonomy.data as Taxonomy;
  checkTaxonomy(taxonomy, ds.taxonomy.file, sink);

  if (!ds.derivation) {
    if (!ds.loadIssues.some((i) => i.file.endsWith("derivation.json"))) {
      sink.error("file-missing", "data/derivation.json", "", "derivation.json not found");
    }
  } else if (!validateDerivation(ds.derivation.data)) {
    schemaIssues(validateDerivation.errors, ds.derivation.file, sink);
  } else {
    checkDerivation(ds.derivation.data as Derivation, ds.derivation.file, taxonomy, ds.schemas.tool, sink);
  }

  const lenses = new Map<string, Lens>();
  for (const { file, data } of ds.lenses) {
    if (!validateLens(data)) {
      schemaIssues(validateLens.errors, file, sink);
      continue;
    }
    const lens = data as Lens;
    checkLens(lens, file, taxonomy, sink);
    if (lenses.has(lens.id)) sink.error("lens-id-duplicate", file, "/id", `lens "${lens.id}" is defined twice`);
    else lenses.set(lens.id, lens);
  }

  const valid: { rec: ToolRecord; file: string }[] = [];
  for (const { file, data } of ds.tools) {
    const validate = validateToolKind((data as { kind?: unknown } | null)?.kind);
    if (!validate(data)) {
      schemaIssues(validate.errors, file, sink);
      continue;
    }
    const rec = data as ToolRecord;
    checkTool(rec, file, taxonomy, lenses, sink);
    valid.push({ rec, file });
  }
  checkComposition(valid, sink);

  return sink.issues;
}

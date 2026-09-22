/**
 * The browser-safe surface of the compile package: everything the site may import. It must never
 * pull in a module that touches the file system, so the site's bundle stays free of Node.
 */
export { computeGaps, groupGaps, isFixFirst, projectGaps, FIX_FIRST_MIN_CRITICALITY, NEEDED_CAPABILITY_CRITICALITY } from "./gaps.js";
export type { Gap, GapGroup, GapKind, GapReport, GapsInLens, Overlap, PlacedGap, Provider, StackCell, StackInput, StageSummary } from "./gaps.js";
export { suggestTools, vendorFamily } from "./suggest.js";
export type { Affinity, Resource, Suggestion } from "./suggest.js";
export { stackBands } from "./stack-bands.js";
export type { Cell, ConditionalLevel, Delivery, Evidence, Maturity } from "./derive.js";
export type { ToolLensView, ZoneView } from "./project.js";
export type { Impact, ProfileTag, RenderCapability, RenderLens, RenderModel, RenderTool } from "./render-model.js";
export type { Archetype } from "./roles.js";

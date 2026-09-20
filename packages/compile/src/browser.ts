/**
 * The browser-safe surface of the compile package: everything the site may import. It must never
 * pull in a module that touches the file system, so the site's bundle stays free of Node.
 */
export { computeGaps, projectGaps, NEEDED_CAPABILITY_CRITICALITY } from "./gaps.js";
export type { Gap, GapKind, GapReport, GapsInLens, PlacedGap, StackCell, StackInput, StageSummary } from "./gaps.js";
export { suggestTools } from "./suggest.js";
export type { Suggestion } from "./suggest.js";
export { stackBands } from "./stack-bands.js";
export type { Cell, ConditionalLevel, Delivery, Evidence, Maturity } from "./derive.js";
export type { ToolLensView, ZoneView } from "./project.js";
export type { RenderCapability, RenderLens, RenderModel, RenderTool } from "./render-model.js";
export type { Archetype } from "./roles.js";

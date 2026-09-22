import type { RenderLens, RenderModel } from "./render-model.js";

/**
 * How well the whole stack covers each band in each zone of a lens: the best level any selected
 * tool reaches, 0 where none does. Bands are drawn as a strip under the tool lanes, never as
 * span, so a tool's governance extras do not stretch its position.
 *
 * Takes the resolved lens itself, not an id, so a caller can pass `effectiveLens`'s result and
 * have a confirmed tier reflected here too.
 */
export function stackBands(model: RenderModel, lens: RenderLens, tools: string[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const band of model.bands) {
    out[band.id] = Object.fromEntries(lens.zones.map((z) => [z, 0]));
  }
  for (const id of new Set(tools)) {
    const view = lens.tools[id];
    if (!view) continue;
    for (const [zone, bands] of Object.entries(view.bands)) {
      for (const [band, level] of Object.entries(bands)) {
        const row = out[band];
        if (row && zone in row) row[zone] = Math.max(row[zone]!, level);
      }
    }
  }
  return out;
}

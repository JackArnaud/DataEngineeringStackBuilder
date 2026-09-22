/**
 * Colour says what a tool does to the data, not which tool it is: four ramps, never more — a fifth
 * would fail the same all-pairs colour-vision check that limited the first three, and a chart where
 * any two rows can sit side by side needs to clear that harder bar, not just the adjacent-pairs one.
 * Shape (the glyph) says which role it plays within its ramp, so no role depends on colour alone.
 */
export type Ramp = "movement" | "transform" | "structural" | "oversight";

export const RAMP_ORDER: Ramp[] = ["movement", "transform", "structural", "oversight"];

export const RAMP_TITLE: Record<Ramp, string> = {
  movement: "Moves data",
  transform: "Transforms data",
  structural: "Structure",
  oversight: "Oversight",
};

export const ROLE_RAMP: Record<string, Ramp> = {
  mover: "movement",
  engine: "transform",
  modeller: "transform",
  // Where data lives: holds it or hands it out.
  substrate: "structural",
  surface: "structural",
  // Watches or coordinates the pipeline without the data values passing through it.
  conductor: "oversight",
  gatekeeper: "oversight",
  sentinel: "oversight",
};

export const rampOf = (role: string): Ramp => ROLE_RAMP[role] ?? "structural";

/**
 * Colour says what a tool does to the data, not which tool it is: three ramps, never more. Shape
 * (the glyph) says which role it plays within its ramp, so no role depends on colour alone.
 */
export type Ramp = "movement" | "transform" | "structural";

export const RAMP_ORDER: Ramp[] = ["movement", "transform", "structural"];

export const RAMP_TITLE: Record<Ramp, string> = {
  movement: "Moves data",
  transform: "Transforms data",
  structural: "Structure",
};

export const ROLE_RAMP: Record<string, Ramp> = {
  mover: "movement",
  engine: "transform",
  modeller: "transform",
  substrate: "structural",
  conductor: "structural",
  gatekeeper: "structural",
  sentinel: "structural",
  surface: "structural",
};

export const rampOf = (role: string): Ramp => ROLE_RAMP[role] ?? "structural";

export const ROLE_LABEL: Record<string, string> = {
  mover: "Mover",
  substrate: "Substrate",
  engine: "Engine",
  modeller: "Modeller",
  conductor: "Conductor",
  gatekeeper: "Gatekeeper",
  sentinel: "Sentinel",
  surface: "Surface",
};

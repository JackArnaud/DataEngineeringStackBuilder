import path from "node:path";
import { compileDataset } from "../../../../packages/compile/src/compile";
import { loadDataset } from "../../../../packages/compile/src/dataset";

/** The real render model, compiled from the real data, so tests exercise what ships. */
export const dataDir = path.resolve(import.meta.dirname, "../../../../data");
export const dataset = loadDataset(dataDir);
export const model = compileDataset(dataset);

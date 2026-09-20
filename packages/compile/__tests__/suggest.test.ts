import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDataset } from "../src/compile.js";
import { computeGaps } from "../src/gaps.js";
import { stackBands } from "../src/stack-bands.js";
import { suggestTools } from "../src/suggest.js";
import { ds } from "./helpers.js";

const model = compileDataset(ds);
const gapOf = (tools: string[], id: string, needs?: string[]) => {
  const gap = computeGaps(model, { tools, needs }).gaps.find((g) => g.id === id);
  if (!gap) throw new Error(`no gap ${id}`);
  return gap;
};
const suggest = (tools: string[], id: string, needs?: string[]) => suggestTools(model, gapOf(tools, id, needs), tools);

describe("suggestions", () => {
  it("offer tools that occupy an empty stage, best first", () => {
    const s = suggest([], "empty-stage:ingest");
    expect(s.length).toBeGreaterThan(3);
    expect(s[0]).toMatchObject({ level: 3, delivery: "native" });
    const ids = s.map((x) => x.tool);
    expect(ids).toEqual(expect.arrayContaining(["aws-dms", "aws-glue", "databricks-lakeflow-connect", "aws-kinesis"]));
  });

  it("rank a native tool above the bundle that contains it, at the same level", () => {
    const ids = suggest([], "empty-stage:ingest").map((x) => x.tool);
    expect(ids.indexOf("databricks-lakeflow-connect")).toBeLessThan(ids.indexOf("databricks"));
  });

  it("never offer a portfolio: its services are offered instead", () => {
    const ids = suggest([], "empty-stage:store").map((x) => x.tool);
    expect(ids).not.toContain("aws");
    expect(ids).toContain("aws-s3");
  });

  it("offer tools that provide a missing band capability, highest level first", () => {
    const s = suggest(["aws-s3"], "band:govern.masking@store");
    expect(s[0]).toMatchObject({ level: 3 });
    expect(s.filter((x) => x.level === 3).map((x) => x.tool)).toEqual(expect.arrayContaining(["unity-catalog", "gcp-bigquery"]));
    // Snowflake Horizon scores masking only on Enterprise, so it is not offered for it.
    expect(s.map((x) => x.tool)).not.toContain("snowflake-horizon");
    expect(s.map((x) => x.level)).toEqual([...s.map((x) => x.level)].sort((a, b) => b - a));
    expect(s.find((x) => x.tool === "postgres")).toMatchObject({ level: 1, delivery: "community" });
  });

  it("offer tools that provide a needed capability", () => {
    const ids = suggest(["postgres"], "needed-capability:ingest.cdc@ingest", ["ingest.cdc"]).map((x) => x.tool);
    expect(ids).toEqual(expect.arrayContaining(["aws-dms", "databricks-lakeflow-connect"]));
  });

  it("skip tools already in the stack", () => {
    const ids = suggest(["aws-dms"], "empty-stage:transform").map((x) => x.tool);
    expect(ids).not.toContain("aws-dms");
    const withGlue = suggestTools(model, gapOf([], "empty-stage:ingest"), ["aws-glue"]).map((x) => x.tool);
    expect(withGlue).not.toContain("aws-glue");
  });

  it("do not offer a tool on the strength of a score that needs a higher plan", () => {
    // dbt platform services score the cross-project DAG only on Enterprise, so they are not offered for it.
    const ids = suggest([], "needed-capability:orchestrate.dependency-dag@orchestrate", ["orchestrate.dependency-dag"]).map((x) => x.tool);
    expect(ids).not.toContain("dbt-platform-services");
    expect(ids).toEqual(expect.arrayContaining(["databricks-workflows", "dbt-core"]));
  });

  it("offer only spine tools for an empty stage, not tools that only have bands", () => {
    const ids = suggest([], "empty-stage:serve").map((x) => x.tool);
    expect(ids).not.toContain("aws-lake-formation");
    expect(ids).not.toContain("ssms");
  });
});

describe("stack band coverage", () => {
  it("shows the best level any selected tool reaches, by band and zone", () => {
    const bands = stackBands(model, "medallion", ["unity-catalog"]);
    expect(bands.govern).toEqual({ source: 0, bronze: 3, silver: 3, gold: 3, consume: 3 });
    // Anomaly detection is scored on the store stage, which medallion spreads over bronze, silver and gold.
    expect(bands.quality).toEqual({ source: 0, bronze: 2, silver: 2, gold: 2, consume: 0 });
  });

  it("takes the best across tools", () => {
    const bands = stackBands(model, "grid", ["aws-s3", "aws-lake-formation"]);
    expect(bands.govern!.store).toBe(3); // Lake Formation's 3 over S3's 2
  });

  it("has a zero row for every band and zone when nothing is selected", () => {
    const bands = stackBands(model, "medallion", []);
    expect(Object.keys(bands)).toEqual(["govern", "quality", "observe", "platform"]);
    for (const row of Object.values(bands)) expect(Object.values(row).every((v) => v === 0)).toBe(true);
  });

  it("ignores unknown tools and refuses an unknown lens", () => {
    expect(stackBands(model, "grid", ["nope"]).govern!.store).toBe(0);
    expect(() => stackBands(model, "kappa", [])).toThrow(/unknown lens/);
  });
});

describe("the browser entry", () => {
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

  /** Every file reachable from browser.ts through relative imports. */
  function reachable(entry: string): Map<string, string> {
    const seen = new Map<string, string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      const source = readFileSync(path.join(srcDir, file), "utf8");
      seen.set(file, source);
      for (const m of source.matchAll(/from\s+"\.\/([^"]+?)\.js"/g)) visit(`${m[1]}.ts`);
    };
    visit(entry);
    return seen;
  }

  it("reaches no module that touches Node, so the site bundle stays free of it", () => {
    const files = reachable("browser.ts");
    expect([...files.keys()]).toEqual(expect.arrayContaining(["gaps.ts", "suggest.ts", "stack-bands.ts", "derive.ts"]));
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/from\s+"node:/);
      expect(source, file).not.toMatch(/from\s+"(ajv|fs|path)/);
    }
    expect(files.has("dataset.ts")).toBe(false);
    expect(files.has("validate.ts")).toBe(false);
  });
});

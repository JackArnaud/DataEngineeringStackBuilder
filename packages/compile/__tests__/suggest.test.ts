import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileDataset } from "../src/compile.js";
import { computeGaps } from "../src/gaps.js";
import { stackBands } from "../src/stack-bands.js";
import { suggestTools, vendorFamily } from "../src/suggest.js";
import { ds } from "./helpers.js";

const model = compileDataset(ds);
const lensOf = (id: string) => model.lenses.find((l) => l.id === id)!;
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

  it("offer tools that provide a missing band capability, and never one that only has it as an extra", () => {
    const s = suggest(["aws-s3"], "band:govern.masking@store");
    // Snowflake Horizon and BigQuery both score masking only on a higher edition, so neither is offered for it.
    expect(s.map((x) => x.tool)).not.toContain("snowflake-horizon");
    expect(s.map((x) => x.tool)).not.toContain("gcp-bigquery");
    expect(s.map((x) => x.tool)).toEqual(expect.arrayContaining(["unity-catalog", "aws-redshift"]));
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
    const bands = stackBands(model, lensOf("medallion"), ["unity-catalog"]);
    expect(bands.govern).toEqual({ source: 0, bronze: 3, silver: 3, gold: 3, consume: 3 });
    // Anomaly detection is scored on the store stage, which medallion spreads over bronze, silver and gold.
    expect(bands.quality).toEqual({ source: 0, bronze: 2, silver: 2, gold: 2, consume: 0 });
  });

  it("takes the best across tools", () => {
    const bands = stackBands(model, lensOf("grid"), ["aws-s3", "aws-lake-formation"]);
    expect(bands.govern!.store).toBe(3); // Lake Formation's 3 over S3's 2
  });

  it("has a zero row for every band and zone when nothing is selected", () => {
    const bands = stackBands(model, lensOf("medallion"), []);
    expect(Object.keys(bands)).toEqual(["govern", "quality", "observe", "platform"]);
    for (const row of Object.values(bands)) expect(Object.values(row).every((v) => v === 0)).toBe(true);
  });

  it("ignores unknown tools", () => {
    expect(stackBands(model, lensOf("grid"), ["nope"]).govern!.store).toBe(0);
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

describe("suggestions from the same ecosystem", () => {
  const stacks: [string[], string][] = [
    [["aws-s3"], "band:govern.masking@store"],
    [["snowflake"], "band:observe.lineage@transform"],
    [["snowflake", "dbt"], "band:govern.catalog@store"],
    [["postgres"], "empty-stage:serve"],
    [["databricks"], "band:quality.contracts@store"],
    [["azure-data-factory"], "band:govern.catalog@ingest"],
  ];
  const cases = stacks.flatMap(([tools, id]) => {
    const found = computeGaps(model, { tools }).gaps.find((g) => g.id === id);
    return found ? [{ tools, id, s: suggestTools(model, found, tools) }] : [];
  });

  it("put a tool from a vendor you already use first, even ahead of a stronger one from elsewhere", () => {
    const s = suggest(["aws-s3"], "band:govern.masking@store");
    expect(s[0]).toMatchObject({ tool: "aws-redshift", level: 2, affinity: "ecosystem", related: ["aws-s3"] });
    // Unity Catalog is a stronger fit for masking on paper, and still comes after the AWS option.
    expect(s.findIndex((x) => x.tool === "unity-catalog")).toBeGreaterThan(0);
    expect(s.find((x) => x.tool === "unity-catalog")).toMatchObject({ level: 3, affinity: "other" });
  });

  it("then put tools that are commonly paired with yours, naming which of yours", () => {
    const s = suggest(["snowflake"], "band:observe.lineage@transform");
    expect(s[0]).toMatchObject({ tool: "dbt-core", affinity: "paired", related: ["snowflake"] });
    const otherFirst = s.findIndex((x) => x.affinity === "other");
    expect(s.slice(0, otherFirst).every((x) => x.affinity !== "other")).toBe(true);
  });

  it("order tools that are good enough to use by fit: ecosystem, then paired, then the rest", () => {
    const rank = { ecosystem: 0, paired: 1, other: 2 } as const;
    expect(cases.length).toBeGreaterThan(3);
    for (const { tools, id, s } of cases) {
      const proper = s.filter((x) => x.level >= 2).map((x) => rank[x.affinity]);
      expect(proper, `${tools} ${id}`).toEqual([...proper].sort((a, b) => a - b));
    }
  });

  it("never let a tool that only reaches level 1 outrank one that provides it properly", () => {
    for (const { tools, id, s } of cases) {
      const firstWeak = s.findIndex((x) => x.level === 1);
      if (firstWeak === -1) continue;
      expect(s.slice(firstWeak).every((x) => x.level === 1), `${tools} ${id}`).toBe(true);
    }
  });

  it("only call a tool related to your stack when it is, and name real tools of yours", () => {
    for (const { tools, s } of cases) {
      for (const x of s) {
        if (x.affinity === "other") expect(x.related).toEqual([]);
        else expect(x.related.length).toBeGreaterThan(0);
        for (const r of x.related) expect(tools).toContain(r);
      }
    }
  });

  it("treat Azure, Fabric and Power BI as one vendor", () => {
    expect(vendorFamily("Microsoft Azure")).toBe("Microsoft");
    expect(vendorFamily("Microsoft")).toBe("Microsoft");
    expect(vendorFamily("Google Cloud")).toBe("Google Cloud");
    const s = suggest(["azure-data-factory"], "empty-stage:serve");
    expect(s.find((x) => x.tool === "power-bi")).toMatchObject({ affinity: "ecosystem" });
  });

  it("leave a stack with no relatives to the old order: level, then delivery", () => {
    const s = suggest([], "empty-stage:ingest");
    expect(s.every((x) => x.affinity === "other")).toBe(true);
    const proper = s.filter((x) => x.level >= 2).map((x) => x.level);
    expect(proper).toEqual([...proper].sort((a, b) => b - a));
  });
});

describe("suggestions and the resources a person already has", () => {
  const at = (ids: string[], tool: string) => ids.indexOf(tool);

  it("moves an open-source tool ahead of an equally-good proprietary one only once it is preferred", () => {
    const plain = suggest([], "empty-stage:transform").map((x) => x.tool);
    // Without a stated preference, id order alone puts the proprietary tool first.
    expect(at(plain, "databricks-runtime")).toBeLessThan(at(plain, "dbt-core"));

    const withOss = suggestTools(model, gapOf([], "empty-stage:transform"), [], ["prefer-oss"]).map((x) => x.tool);
    expect(at(withOss, "dbt-core")).toBeLessThan(at(withOss, "databricks-runtime"));
  });

  it("leaves order alone until the resources step is actually answered", () => {
    const unanswered = suggest([], "empty-stage:store").map((x) => x.tool);
    // An unstated resources array means the question was never asked, not "confirmed no procurement".
    expect(at(unanswered, "fabric-data-warehouse")).toBeLessThan(at(unanswered, "gcp-bigquery"));
    const explicitEmpty = suggestTools(model, gapOf([], "empty-stage:store"), [], []).map((x) => x.tool);
    expect(explicitEmpty).toEqual(unanswered);
  });

  it("sets back a tool priced in a way that usually needs a sales conversation, once resources are answered without ticking it", () => {
    const answered = suggestTools(model, gapOf([], "empty-stage:store"), [], ["prefer-oss"]).map((x) => x.tool);
    expect(at(answered, "gcp-bigquery")).toBeLessThan(at(answered, "fabric-data-warehouse"));

    const withProcurement = suggestTools(model, gapOf([], "empty-stage:store"), [], ["prefer-oss", "procurement"]).map((x) => x.tool);
    expect(at(withProcurement, "fabric-data-warehouse")).toBeLessThan(at(withProcurement, "gcp-bigquery"));
  });

  it("never lets resources promote a tool that only reaches level 1 above a proper one", () => {
    const s = suggestTools(model, gapOf([], "empty-stage:ingest"), [], ["prefer-oss"]);
    const proper = s.filter((x) => x.level >= 2);
    const weak = s.filter((x) => x.level < 2);
    if (proper.length > 0 && weak.length > 0) expect(s.indexOf(proper[proper.length - 1]!)).toBeLessThan(s.indexOf(weak[0]!));
  });
});

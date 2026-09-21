// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeGaps } from "@compile";
import { Builder, Root } from "../App";
import { model } from "./fixture";

function setup(url = "/") {
  window.history.replaceState(null, "", url);
  const user = userEvent.setup();
  render(<Builder model={model} />);
  return user;
}

const chips = () => screen.getByRole("list", { name: "Selected tools" });
/** The "Add all" control lives in a vendor's heading row; several vendors have one, so find it by vendor. */
const vendorHead = (vendor: string) => screen.getByRole("heading", { name: vendor }).closest<HTMLElement>(".vendor__head")!;
/** Vendors start folded, so a test opens one before reaching for its tools. */
const openVendor = (user: ReturnType<typeof userEvent.setup>, vendor: string) => user.click(screen.getByRole("button", { name: vendor, expanded: false }));
const showNeeds = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("tab", { name: /What you need/ }));
/** The picker's own result line; other parts of the page also announce things. */
const pickerCount = () => document.querySelector(".picker__count");
/** How many services the AWS portfolio lists; the tests should not care as the catalogue grows. */
const awsServices = model.tools.find((t) => t.id === "aws")!.includes!.length;
const gapButtons = () => screen.getAllByRole("button").filter((b) => b.classList.contains("gap"));

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("an empty stack", () => {
  it("flags every stage that matters, and offers examples to start from", () => {
    setup();
    for (const stage of ["Serve", "Store", "Ingest", "Transform", "Orchestrate"]) {
      expect(screen.getByText(`Nothing in your stack covers ${stage}`)).toBeTruthy();
    }
    expect(screen.queryByText("Nothing in your stack covers Source")).toBeNull(); // source is never a gap
    expect(screen.getByRole("button", { name: /Databricks lakehouse/ })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Selected tools" })).toBeNull();
  });

  it("ranks the gaps: the two critical stages come first", () => {
    setup();
    const first = gapButtons().slice(0, 2).map((b) => b.textContent);
    expect(first.every((t) => t?.includes("Critical"))).toBe(true);
  });
});

describe("building a stack", () => {
  it("adds a tool from the picker, updates coverage, and writes it to the address", async () => {
    const user = setup();
    await openVendor(user, "Amazon Web Services");
    await user.click(screen.getByRole("checkbox", { name: /Amazon S3/ }));

    expect(within(chips()).getByText("Amazon S3")).toBeTruthy();
    expect(screen.queryByText("Nothing in your stack covers Store")).toBeNull();
    expect(screen.getByText("Nothing in your stack covers Serve")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe("?tools=aws-s3"));
  });

  it("starts from an example", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Databricks lakehouse/ }));
    expect(within(chips()).getByText("Databricks")).toBeTruthy();
    // A whole Databricks stack leaves no stage empty.
    expect(screen.queryByText(/^Nothing in your stack covers/)).toBeNull();
  });

  it("adds every service of a portfolio at once, and only its services", async () => {
    const user = setup();
    await user.click(within(vendorHead("Amazon Web Services")).getByRole("button", { name: `Add all ${awsServices} services` }));
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(awsServices);
    expect(within(chips()).queryByText("Amazon Web Services")).toBeNull();
    expect((within(vendorHead("Amazon Web Services")).getByRole("button", { name: "All services added" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a portfolio service that the picker lists under another vendor", async () => {
    window.history.replaceState(null, "", "/");
    const user = userEvent.setup();
    const moved = { ...model, tools: model.tools.map((t) => (t.id === "aws-glue" ? { ...t, vendor: "Somebody Else" } : t)) };
    render(<Builder model={moved} />);
    await user.click(within(vendorHead("Amazon Web Services")).getByRole("button", { name: `Add all ${awsServices} services` }));
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(awsServices);
    expect(within(chips()).getByText("AWS Glue")).toBeTruthy();
  });

  it("removes a tool", async () => {
    const user = setup("/?tools=postgres,dbt-core");
    await user.click(screen.getByRole("button", { name: "Remove PostgreSQL" }));
    expect(within(chips()).queryByText("PostgreSQL")).toBeNull();
    expect(within(chips()).getByText("dbt OSS (dbt Core)")).toBeTruthy();
  });

  it("starts over", async () => {
    const user = setup("/?tools=postgres&needs=ingest.cdc");
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.queryByRole("list", { name: "Selected tools" })).toBeNull();
    expect(screen.getByRole("button", { name: /Databricks lakehouse/ })).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("restores a whole stack from the address", () => {
    setup("/?tools=postgres,dbt-core&needs=ingest.cdc&lens=grid&view=table");
    expect(within(chips()).getByText("PostgreSQL")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Audit grid" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Table" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("table", { name: /Where your tools sit in the Audit grid lens/ })).toBeTruthy();
    expect(screen.getByText("You need Change data capture, and nothing provides it")).toBeTruthy();
  });
});

describe("the example gallery", () => {
  it("shows worked examples grouped by theme when nothing is picked, including one that ends in AI", () => {
    setup();
    const gallery = screen.getByRole("region", { name: "Start from an example" });
    expect(within(gallery).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toContain("Ending in AI");
    expect(within(gallery).getAllByRole("button", { name: /^Load / }).length).toBeGreaterThan(10);
  });

  it("loads an example with its needs, and gets out of the way", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Load Features to a model on Google Cloud" }));
    expect(screen.queryByRole("region", { name: "Start from an example" })).toBeNull();
    expect(within(chips()).getByText("BigQuery")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("ML serving")).toBeTruthy();
  });

  it("comes back after start over", async () => {
    const user = setup("/?tools=github");
    expect(screen.queryByRole("region", { name: "Start from an example" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("region", { name: "Start from an example" })).toBeTruthy();
  });
});

describe("finding a tool", () => {
  it("starts with vendors folded, so the list is short", () => {
    setup();
    expect(screen.queryByRole("checkbox", { name: /Amazon S3/ })).toBeNull();
    expect(within(vendorHead("Amazon Web Services")).getByRole("button", { name: "Amazon Web Services", expanded: false })).toBeTruthy();
  });

  it("opens the matching vendors when you search, and says how many matched", async () => {
    const user = setup();
    await user.type(screen.getByRole("searchbox", { name: "Find a tool" }), "glue");
    expect(screen.getByRole("checkbox", { name: /AWS Glue/ })).toBeTruthy();
    expect(pickerCount()?.textContent).toMatch(/1 tool in 1 vendor/);
  });

  it("narrows to tools that cover a stage, and back again", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Orchestrate", pressed: false }));
    expect(screen.getByRole("checkbox", { name: /dbt OSS/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Amazon S3/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Any stage" }));
    expect(pickerCount()).toBeNull();
  });

  it("says so when nothing matches", async () => {
    const user = setup();
    await user.type(screen.getByRole("searchbox", { name: "Find a tool" }), "zzzz");
    expect(pickerCount()?.textContent).toContain("No tool matches");
  });

  it("shows how many tools you have added to a folded vendor", async () => {
    setup("/?tools=aws-s3,aws-glue");
    expect(within(vendorHead("Amazon Web Services").parentElement!).getByText("2 added")).toBeTruthy();
  });
});

describe("saying what you need", () => {
  it("keeps needs one tab away, with a count, and shows the ones you picked beside your tools", async () => {
    const user = setup("/?tools=postgres&needs=ingest.cdc");
    const tab = screen.getByRole("tab", { name: /What you need/ });
    expect(tab.textContent).toContain("1");
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("Change data capture")).toBeTruthy();

    await user.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("checkbox", { name: /Change data capture/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("drops a need from its chip", async () => {
    const user = setup("/?tools=postgres&needs=ingest.cdc");
    await user.click(screen.getByRole("button", { name: "Stop needing Change data capture" }));
    expect(screen.queryByRole("list", { name: "Selected needs" })).toBeNull();
    await waitFor(() => expect(window.location.search).toBe("?tools=postgres"));
  });

  it("moves between the two tabs with the arrow keys", async () => {
    const user = setup();
    screen.getByRole("tab", { name: /Tools you have/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /What you need/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /What you need/ }));
  });
});

describe("needs", () => {
  it("flags something you said you need and your tools lack, ahead of everything else", async () => {
    const user = setup("/?tools=postgres");
    await showNeeds(user);
    await user.click(screen.getByRole("checkbox", { name: /Change data capture/ }));
    const top = gapButtons()[0]!;
    expect(top.textContent).toContain("You need Change data capture, and nothing provides it");
    expect(top.textContent).toContain("Critical");
  });

  it("stops flagging a need once a tool provides it", async () => {
    const user = setup("/?tools=postgres&needs=ingest.cdc");
    expect(screen.getByText("You need Change data capture, and nothing provides it")).toBeTruthy();
    await openVendor(user, "Amazon Web Services");
    await user.click(screen.getByRole("checkbox", { name: /AWS Database Migration Service/ }));
    expect(screen.queryByText("You need Change data capture, and nothing provides it")).toBeNull();
  });
});

describe("the gap list", () => {
  const stack = "/?tools=aws-s3,aws-glue,aws-athena";

  it("folds a capability missing at several stages into one row, so the list is short", () => {
    setup(stack);
    const facts = computeGaps(model, { tools: ["aws-s3", "aws-glue", "aws-athena"] }).gaps;
    expect(gapButtons().length).toBeGreaterThan(0);
    expect(gapButtons().length).toBeLessThan(facts.length);
    const titles = gapButtons().map((b) => b.querySelector(".gap__title")?.textContent);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.some((t) => /is missing at (.+ and .+|\d+ stages)/.test(t ?? ""))).toBe(true);
  });

  it("puts the urgent ones first and the lower-priority cross-cutting ones behind a fold", () => {
    setup(stack);
    expect(document.querySelector(".gaplist__intro")?.textContent).toMatch(/to fix first, \d+ more worth checking/);
    const rest = document.querySelector(".gapsrest")!;
    expect(within(rest as HTMLElement).getAllByRole("heading").length).toBeGreaterThan(0);
    const urgent = within(screen.getByRole("list", { name: "Fix first" })).getAllByRole("button").filter((b) => b.classList.contains("gap"));
    for (const b of urgent) expect(b.textContent).toMatch(/Critical|Serious/);
  });

  it("lets you set a cross-cutting capability aside, keeps the address and the matrix honest, and brings it back", async () => {
    const user = setup(stack);
    const titles = () => gapButtons().map((b) => b.querySelector(".gap__title")?.textContent);
    const [skip] = screen.getAllByRole("button", { name: /^Not relevant to my stack: / });
    const title = skip!.getAttribute("aria-label")!.replace("Not relevant to my stack: ", "");
    await user.click(skip!);

    expect(titles()).not.toContain(title);
    await waitFor(() => expect(window.location.search).toMatch(/skip=/));
    expect(screen.getByText(/1 capability set aside as not relevant/)).toBeTruthy();

    await user.click(screen.getByText(/1 capability set aside as not relevant/));
    await user.click(screen.getByRole("button", { name: /^Bring back: / }));
    expect(titles()).toContain(title);
    await waitFor(() => expect(window.location.search).not.toMatch(/skip=/));
  });

  it("restores set-aside capabilities from the address, and clears them on start over", async () => {
    const user = setup(`${stack}&skip=govern.masking`);
    expect(screen.getByText(/1 capability set aside as not relevant/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("says on every row what goes wrong without it", () => {
    setup(stack);
    const rows = gapButtons();
    expect(rows.length).toBeGreaterThan(0);
    for (const b of rows) expect(b.querySelector(".gap__why")?.textContent?.length ?? 0, b.textContent ?? "").toBeGreaterThan(20);
  });

  it("explains a cross-cutting gap in plain words: consequence, example, AI, and when to skip it", async () => {
    const user = setup(stack);
    const masking = gapButtons().find((b) => /^Masking is missing/.test(b.querySelector(".gap__title")?.textContent ?? ""))!;
    await user.click(masking);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "What goes wrong without it" })).toBeTruthy();
    expect(dialog.textContent).toContain("For example:");
    expect(within(dialog).getByRole("heading", { name: "If AI uses this data" })).toBeTruthy();
    expect(dialog.textContent).toContain("Reasonable to skip if:");
    expect(within(dialog).getByRole("heading", { name: /^Why it ranks/ })).toBeTruthy();
  });

  it("explains an empty stage and a stated need, without offering to skip either", async () => {
    const user = setup("/?tools=postgres&needs=serve.ml-serving");
    const need = gapButtons().find((b) => /You need/.test(b.textContent ?? ""))!;
    await user.click(need);
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "What goes wrong without it" })).toBeTruthy();
    expect(dialog.textContent).not.toContain("Reasonable to skip if:");
    expect(within(dialog).getByRole("heading", { name: "If AI uses this data" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    await user.click(gapButtons().find((b) => /Nothing in your stack covers/.test(b.textContent ?? ""))!);
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "What goes wrong without it" })).toBeTruthy();
  });

  it("names the other stages in the detail of a gap that is missing at several", async () => {
    const user = setup(stack);
    const multi = gapButtons().find((b) => /is missing at (.+ and .+|\d+ stages)/.test(b.querySelector(".gap__title")?.textContent ?? ""))!;
    await user.click(multi);
    expect(screen.getByRole("heading", { name: "Also missing at" })).toBeTruthy();
  });
});

describe("lenses", () => {
  it("switches the zones between the audit grid and medallion", async () => {
    const user = setup("/?tools=aws-s3,aws-glue");
    // The picker also has an "Orchestrate" button, for its stage filter, so look only in the chart.
    const chart = () => within(screen.getByRole("main"));
    expect(chart().getByRole("button", { name: "Bronze" })).toBeTruthy();
    expect(chart().queryByRole("button", { name: "Orchestrate" })).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Audit grid" }));
    expect(chart().getByRole("button", { name: "Orchestrate" })).toBeTruthy();
    expect(chart().queryByRole("button", { name: "Bronze" })).toBeNull();
    await waitFor(() => expect(window.location.search).toContain("lens=grid"));
  });

  it("shows a gap the lens has no zone for in its side rail, and still in the ranked list", async () => {
    const user = setup("/?tools=postgres&needs=ingest.reverse-etl");
    const listed = gapButtons().find((b) => b.textContent?.includes("You need Reverse ETL"))!;
    expect(listed.textContent).toContain("side rail");

    await user.click(screen.getByText(/Not shown in the Medallion architecture lens/));
    const rail = document.querySelector(".rail")!;
    expect(within(rail as HTMLElement).getByRole("button", { name: /You need Reverse ETL/ })).toBeTruthy();
  });

  it("places the same gap in a zone in the audit grid", async () => {
    setup("/?tools=postgres&needs=ingest.reverse-etl&lens=grid");
    const listed = gapButtons().find((b) => b.textContent?.includes("You need Reverse ETL"))!;
    expect(listed.textContent).toContain("Needed · Ingest");
  });

  it("offers a table twin of the chart", async () => {
    const user = setup("/?tools=dbt-core");
    expect(screen.queryByRole("table", { name: /Where your tools sit/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table", { name: /Where your tools sit/ });
    const row = within(table).getByRole("row", { name: /dbt OSS/ });
    expect(row.textContent).toContain("Core"); // silver and gold
  });
});

describe("the marks", () => {
  it("name the tool, the zone and the level in words, so nothing depends on colour", () => {
    setup("/?tools=dbt-core");
    const marks = screen.getAllByRole("button").filter((b) => b.classList.contains("mark"));
    const labels = marks.map((m) => m.getAttribute("aria-label")!);
    expect(labels).toContain("dbt OSS (dbt Core), Silver: Core, core position");
    expect(labels).toContain("dbt OSS (dbt Core), Gold: Core, core position");
    expect(labels.some((l) => l.includes("Bronze") && !l.includes("core position"))).toBe(true);
  });

  it("show a tooltip on hover and on focus, and hide it after", async () => {
    const user = setup("/?tools=dbt-core");
    const mark = screen.getAllByRole("button").find((b) => b.getAttribute("aria-label")?.startsWith("dbt OSS (dbt Core), Silver"))!;

    await user.hover(mark);
    expect(screen.getByText("Click for notes and sources")).toBeTruthy();
    await user.unhover(mark);
    expect(screen.queryByText("Click for notes and sources")).toBeNull();

    mark.focus();
    await waitFor(() => expect(screen.getByText("Click for notes and sources")).toBeTruthy());
  });

  it("count gaps at the worst tier in a zone, not every gap that touches it", () => {
    setup("/?tools=databricks,dbt-platform");
    const chip = screen.getAllByRole("button").find((b) => b.classList.contains("gapchip") && b.getAttribute("aria-label")?.includes("Source"))!;
    expect(chip.getAttribute("aria-label")).toMatch(/^\d+ critical gaps? and \d+ lower in Source$/);
  });
});

describe("receipts", () => {
  it("open a tool to its scores, each with a note and an https source link", async () => {
    const user = setup("/?tools=dbt-core");
    await user.click(within(chips()).getByRole("button", { name: "dbt OSS (dbt Core)" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "dbt OSS (dbt Core)" })).toBeTruthy();
    const items = dialog.querySelectorAll(".evidence__item");
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      const link = item.querySelector<HTMLAnchorElement>("a.source");
      expect(link, item.textContent ?? "").not.toBeNull();
      expect(link!.href).toMatch(/^https:\/\//);
      expect(link!.target).toBe("_blank");
      expect(link!.rel).toContain("noopener");
      expect(item.querySelector(".evidence__note")!.textContent!.length).toBeGreaterThan(10);
    }
  });

  it("explain a bundle by its parts and a portfolio as comparison only", async () => {
    const user = setup("/?tools=databricks");
    await user.click(within(chips()).getByRole("button", { name: "Databricks" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Parts" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Databricks SQL" })).toBeTruthy();
    expect(dialog.textContent).toContain("nothing here is scored by hand");

    await user.click(within(dialog).getByRole("button", { name: "Databricks SQL" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Databricks SQL" })).toBeTruthy();
    expect(dialog.textContent).toContain("Part of Databricks");
  });

  it("show a higher plan's level as a note, never as coverage", async () => {
    const user = setup("/?tools=dbt-platform-services");
    await user.click(within(chips()).getByRole("button", { name: "dbt platform (hosted services)" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/Reaches core only on an Enterprise plan/);
    expect(dialog.textContent).toContain("Not counted as coverage");
  });

  it("open a gap to why it matters and what would close it, and let you add a fix", async () => {
    const user = setup();
    await user.click(gapButtons()[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "What goes wrong without it" })).toBeTruthy();
    expect(dialog.textContent).toContain("Criticality 5 of 5");
    expect(within(dialog).getByRole("heading", { name: "What would close it" })).toBeTruthy();

    await user.click(within(dialog).getAllByRole("button", { name: /^Add .* to your stack$/ })[0]!);
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(1);
    // The fix closed the very gap being read.
    expect(within(screen.getByRole("dialog")).getByText("This gap is closed in your current stack.")).toBeTruthy();
  });

  it("open a zone to the tools, cross-cutting coverage and gaps in it", async () => {
    const user = setup("/?tools=dbt-core");
    await user.click(screen.getByRole("button", { name: "Silver" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Silver" })).toBeTruthy();
    expect(dialog.textContent).toContain("dbt OSS (dbt Core)");
    expect(dialog.textContent).toContain("Cross-cutting here");
    // Orchestration is spread over every zone in this lens, so it lands here too.
    expect(dialog.textContent).toMatch(/where Store, Transform and Orchestrate land/);
  });

  it("close with Escape or the close button", async () => {
    const user = setup("/?tools=dbt-core");
    await user.click(within(chips()).getByRole("button", { name: "dbt OSS (dbt Core)" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(within(chips()).getByRole("button", { name: "dbt OSS (dbt Core)" }));
    await user.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("loading the data", () => {
  it("shows a loading state, then the builder", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => model })));
    render(<Root />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(await screen.findByRole("heading", { name: "Data stack builder" })).toBeTruthy();
  });

  it("explains a failed load and lets you try again", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: true, json: async () => model });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Root />);

    expect((await screen.findByRole("alert")).textContent).toContain("404");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Data stack builder" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a file that is not a render model this version understands", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ format: "something-else" }) })));
    render(<Root />);
    expect((await screen.findByRole("alert")).textContent).toContain("not a render model");
  });
});

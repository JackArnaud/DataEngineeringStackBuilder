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

/** Renders the guided start, as a first-time visitor sees it. */
function setupLanding(url = "/") {
  window.history.replaceState(null, "", url);
  const user = userEvent.setup();
  render(<Builder model={model} startOnLanding />);
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
/** The gap list and the overlaps each live on a tab; an address ending in one opens straight on it. */
const missing = (url = "/") => `${url}#missing`;
const overlapsTab = (url: string) => `${url}#overlaps`;
const openTab = (user: ReturnType<typeof userEvent.setup>, name: RegExp) => user.click(screen.getByRole("tab", { name }));
const gapButtons = () => screen.getAllByRole("button").filter((b) => b.classList.contains("gap"));

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("an empty stack", () => {
  it("flags every stage that matters, and points to the guided start", () => {
    setup(missing());
    for (const stage of ["Serve", "Store", "Ingest", "Transform", "Orchestrate"]) {
      expect(screen.getByText(`Nothing in your stack covers ${stage}`)).toBeTruthy();
    }
    expect(screen.queryByText("Nothing in your stack covers Source")).toBeNull(); // source is never a gap
    expect(screen.getByText(/Nothing picked yet/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Selected tools" })).toBeNull();
  });

  it("ranks the gaps: the two critical stages come first", () => {
    setup(missing());
    const first = gapButtons().slice(0, 2).map((b) => b.textContent);
    expect(first).toHaveLength(2);
    expect(first.every((t) => t?.includes("Critical"))).toBe(true);
  });
});

describe("building a stack", () => {
  it("adds a tool from the picker, updates coverage, and writes it to the address", async () => {
    const user = setup(missing());
    await openVendor(user, "Amazon Web Services");
    await user.click(screen.getByRole("checkbox", { name: /Amazon S3/ }));

    expect(within(chips()).getByText("Amazon S3")).toBeTruthy();
    expect(screen.queryByText("Nothing in your stack covers Store")).toBeNull();
    expect(screen.getByText("Nothing in your stack covers Serve")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe("?tools=aws-s3"));
  });

  it("adds every service of a portfolio at once, and only its services", async () => {
    const user = setup();
    await openVendor(user, "Amazon Web Services");
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
    await openVendor(user, "Amazon Web Services");
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
    expect(screen.getByText(/Nothing picked yet/)).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("restores a whole stack from the address", async () => {
    const user = setup("/?tools=postgres,dbt-core&needs=ingest.cdc&lens=grid&view=table");
    expect(within(chips()).getByText("PostgreSQL")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Audit grid" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Table" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("table", { name: /Where your tools sit in the Audit grid lens/ })).toBeTruthy();
    await openTab(user, /What.s missing/);
    expect(screen.getByText("You need Change data capture, and nothing provides it")).toBeTruthy();
  });
});

describe("the guided start", () => {
  const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /^(Next|Skip)$/ }));
  const title = () => document.getElementById("step-title")?.textContent;

  it("asks how to start before showing any guidance", () => {
    setupLanding();
    expect(screen.getByRole("heading", { name: "How would you like to start?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start from an example/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Build my own/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Coverage by stage" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "What\u2019s missing" })).toBeNull();
  });

  it("offers worked examples, grouped by theme, one of which ends in AI", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Start from an example/ }));
    const gallery = screen.getByRole("region", { name: "Start from an example" });
    expect(within(gallery).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toContain("Ending in AI");
    expect(within(gallery).getAllByRole("button", { name: /^Load / }).length).toBeGreaterThan(10);
  });

  it("loads an example with its needs and opens the guidance", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Start from an example/ }));
    await user.click(screen.getByRole("button", { name: "Load Features to a model on Google Cloud" }));
    expect(screen.queryByRole("heading", { name: "How would you like to start?" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Coverage by stage" })).toBeTruthy();
    expect(within(chips()).getByText("BigQuery")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("ML serving")).toBeTruthy();
  });

  it("builds a stack one question at a time, and lets any step be skipped", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Build my own/ }));
    expect(title()).toBe("Where does your data start?");
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: /PostgreSQL/ }));
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    await next(user);

    expect(title()).toBe("Where will it be stored and processed?");
    await user.click(screen.getByRole("checkbox", { name: /^Snowflake/ }));
    await user.click(screen.getByRole("checkbox", { name: /^Amazon Web Services/ }));
    await next(user);

    // Choosing a cloud adds a screen for its services.
    expect(title()).toBe("Which Amazon Web Services services do you use?");
    await user.click(screen.getByRole("checkbox", { name: /^Amazon S3/ }));
    await next(user);

    expect(title()).toBe("How do you model and schedule the work?");
    await user.click(screen.getByRole("checkbox", { name: /^dbt \(v2\)/ }));
    await next(user);
    expect(title()).toBe("How do people use the data?");
    await next(user); // skipped
    expect(title()).toBe("How do you keep changes under control?");
    await user.click(screen.getByRole("checkbox", { name: /^GitHub/ }));
    await next(user);

    expect(title()).toBe("What does it need to do?");
    await user.click(screen.getByRole("checkbox", { name: /Dashboards and reports/ }));
    await next(user);

    expect(title()).toBe("Here is your stack");
    const review = document.querySelector(".landing")!.textContent!;
    expect(review).toContain("Snowflake");
    expect(review).toContain("Amazon S3");
    expect(review).toContain("BI and visualisation");

    await user.click(screen.getByRole("button", { name: "Show me what's missing" }));
    expect(screen.getByRole("heading", { name: "Coverage by stage" })).toBeTruthy();
    expect(within(chips()).getByText("Snowflake")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("BI and visualisation")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toContain("needs=serve.bi-viz"));
  });

  it("lets a group of services be selected or cleared at once", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Build my own/ }));
    await next(user);
    await user.click(screen.getByRole("checkbox", { name: /^Amazon Web Services/ }));
    await next(user);
    await user.click(screen.getByRole("button", { name: /^Select all/ }));
    expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
  });

  it("goes back a step without losing choices, and back to the start from the first", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Build my own/ }));
    await user.click(screen.getByRole("checkbox", { name: /PostgreSQL/ }));
    await next(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByRole("checkbox", { name: /PostgreSQL/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "How would you like to start?" })).toBeTruthy();
  });

  it("keeps the needs cards and the needs tab in agreement", async () => {
    const user = setupLanding("/");
    await user.click(screen.getByRole("button", { name: /Build my own/ }));
    for (let i = 0; i < 5; i += 1) await next(user);
    await user.click(screen.getByRole("checkbox", { name: /Machine learning in production/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Show me what's missing" }));
    await user.click(screen.getByRole("tab", { name: /What you need/ }));
    expect((screen.getByRole("checkbox", { name: /Feature engineering/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /ML serving/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("lets someone who knows their stack skip straight to the builder", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /go straight to the builder/ }));
    expect(screen.getByRole("heading", { name: "Coverage by stage" })).toBeTruthy();
  });

  it("goes straight to the guidance for an address that already carries a stack", () => {
    setupLanding("/?tools=postgres");
    expect(screen.queryByRole("heading", { name: "How would you like to start?" })).toBeNull();
    expect(within(chips()).getByText("PostgreSQL")).toBeTruthy();
  });

  it("reopens from the builder with the choices kept, and start over returns to it", async () => {
    const user = setupLanding("/?tools=postgres");
    await user.click(screen.getByRole("button", { name: "Guided start" }));
    expect(screen.getByRole("heading", { name: "How would you like to start?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Build my own/ }));
    expect((screen.getByRole("checkbox", { name: /PostgreSQL/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: /go straight to the builder/ }));

    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("heading", { name: "How would you like to start?" })).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});

describe("overlapping tools", () => {
  const stack = "/?tools=snowflake,dbt,github";
  const atOverlaps = overlapsTab(stack);
  const section = () => screen.getByRole("region", { name: "Where your tools overlap" });
  const useFor = (name: RegExp) => within(section()).getByRole("combobox", { name }) as HTMLSelectElement;

  it("lists the tasks more than one of your tools can do, with who leads", () => {
    setup(atOverlaps);
    expect(within(section()).getByText(/can be done by more than one of your tools/)).toBeTruthy();
    // GitHub is native and Snowflake bundled, both level 2, so GitHub leads on scheduling.
    expect(useFor(/Used for Scheduling/).options[0]!.textContent).toMatch(/GitHub.*\(best score\)/);
    expect(useFor(/Used for Scheduling/).value).toBe("");
  });

  it("says so, and flags it, when the best tools tie", () => {
    setup(atOverlaps);
    const sql = useFor(/Used for SQL transformation/);
    expect(sql.options[0]!.textContent).toMatch(/No clear lead/);
    expect(sql.closest("li")!.textContent).toContain("Choose one");
  });

  it("keeps your choice in the address, and takes it away with the tool", async () => {
    const user = setup(atOverlaps);
    await user.selectOptions(useFor(/Used for SQL transformation/), "dbt");
    await waitFor(() => expect(window.location.search).toContain("use=transform.sql-transform:dbt"));
    expect(useFor(/Used for SQL transformation/).closest("li")!.textContent).not.toContain("Choose one");

    await user.click(screen.getByRole("button", { name: "Remove dbt (v2)" }));
    await waitFor(() => expect(window.location.search).not.toContain("use="));
  });

  it("scores the task by the tool you use, and shows it in the tool's row", async () => {
    const user = setup("/?tools=aws-mwaa,github");
    expect(screen.getByRole("list", { name: "Coverage by stage" }).textContent).toContain("Amazon MWAA");
    await openTab(user, /Overlaps/);
    await user.selectOptions(useFor(/Used for Scheduling/), "github");
    await waitFor(() => expect(window.location.search).toContain("use=orchestrate.scheduling:github"));
    await openTab(user, /Coverage/);
    // Amazon MWAA still leads on other tasks but is no longer the one used for scheduling.
    const lane = screen.getAllByText(/not used for/).map((n) => n.textContent).join(" ");
    expect(lane).toContain("scheduling");
  });

  it("counts the overlaps in each stage of the strip, and clears with start over", async () => {
    const user = setup(`${stack}&use=transform.sql-transform:dbt`);
    expect(within(screen.getByRole("list", { name: "Coverage by stage" })).getAllByText(/\d+ overlaps?/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("region", { name: "Where your tools overlap" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Overlaps/ })).toBeNull();
  });

  it("shows nothing when no task is shared", () => {
    setup("/?tools=aws-s3");
    expect(screen.queryByRole("region", { name: "Where your tools overlap" })).toBeNull();
  });
});

describe("tools with no place in the pipeline", () => {
  it("get a row in the matrix, under cross-cutting tools, instead of a footnote", () => {
    setup("/?tools=aws-s3,aws-lake-formation,azure-monitor");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    expect(within(matrix).getByRole("heading", { name: "Cross-cutting tools" })).toBeTruthy();
    const rows = Array.from(matrix.querySelectorAll(".lane__label")).map((n) => n.textContent);
    expect(rows.some((t) => t?.startsWith("AWS Lake Formation"))).toBe(true);
    expect(rows.some((t) => t?.startsWith("Azure Monitor"))).toBe(true);
    expect(screen.queryByText(/with no position in the pipeline/)).toBeNull();
  });

  it("say which concerns they cover, and mark their reach across the zones", () => {
    setup("/?tools=aws-lake-formation");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    expect(matrix.textContent).toContain("Govern");
    expect(within(matrix).getAllByRole("button", { name: /AWS Lake Formation, .*cross-cutting/ }).length).toBeGreaterThan(1);
  });

  it("are rows in the table view too", async () => {
    setup("/?tools=aws-lake-formation&view=table");
    const table = screen.getByRole("table", { name: /Where your tools sit/ });
    expect(within(table).getByText(/cross-cutting: Govern/)).toBeTruthy();
  });

  it("do not disturb the pipeline rows of the tools beside them", () => {
    setup("/?tools=aws-s3,aws-lake-formation");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    const rows = Array.from(matrix.querySelectorAll(".lane__label")).map((n) => n.textContent);
    expect(rows.some((t) => t?.startsWith("Amazon S3"))).toBe(true);
  });

  it("get a row even where the lens has no zone for what they do, and say so", () => {
    setup("/?tools=aws-s3,azure-cost-management");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    const row = Array.from(matrix.querySelectorAll(".lane__label")).find((n) => n.textContent?.startsWith("Microsoft Cost Management"))!;
    expect(row.textContent).toContain("no zone in this lens: cost visibility");
  });
});

describe("the stage strip", () => {
  it("names every tool in a stage, including one that another beats on every capability", () => {
    setup("/?tools=aws-mwaa,github");
    const strip = screen.getByRole("list", { name: "Coverage by stage" });
    const orchestrate = within(strip).getAllByRole("listitem").find((li) => li.textContent?.startsWith("Orchestrate"))!;
    expect(orchestrate.textContent).toContain("Amazon MWAA");
    expect(orchestrate.textContent).toContain("GitHub");
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
    await user.selectOptions(screen.getByRole("combobox", { name: /Covers/ }), "orchestrate");
    expect(screen.getByRole("checkbox", { name: /dbt OSS/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Amazon S3/ })).toBeNull();
    await user.selectOptions(screen.getByRole("combobox", { name: /Covers/ }), "");
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
    const user = setup(missing("/?tools=postgres"));
    await showNeeds(user);
    await user.click(screen.getByRole("checkbox", { name: /Change data capture/ }));
    const top = gapButtons()[0]!;
    expect(top.textContent).toContain("You need Change data capture, and nothing provides it");
    expect(top.textContent).toContain("Critical");
  });

  it("stops flagging a need once a tool provides it", async () => {
    const user = setup(missing("/?tools=postgres&needs=ingest.cdc"));
    expect(screen.getByText("You need Change data capture, and nothing provides it")).toBeTruthy();
    await openVendor(user, "Amazon Web Services");
    await user.click(screen.getByRole("checkbox", { name: /AWS Database Migration Service/ }));
    expect(screen.queryByText("You need Change data capture, and nothing provides it")).toBeNull();
  });
});

describe("the gap list", () => {
  const stack = missing("/?tools=aws-s3,aws-glue,aws-athena");

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
    const user = setup(missing("/?tools=aws-s3,aws-glue,aws-athena&skip=govern.masking"));
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
    expect(within(dialog).getByText(/^Why it ranks/)).toBeTruthy();
  });

  it("explains an empty stage and a stated need, without offering to skip either", async () => {
    const user = setup(missing("/?tools=postgres&needs=serve.ml-serving"));
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

  it("suggests tools from a vendor you already use first, and says so", async () => {
    const user = setup(missing("/?tools=aws-s3"));
    const masking = gapButtons().find((b) => /^Masking is missing/.test(b.querySelector(".gap__title")?.textContent ?? ""))!;
    await user.click(masking);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Tools from vendors you already use come first.");
    const first = dialog.querySelector(".suggestion")!;
    expect(first.textContent).toContain("Same vendor as Amazon S3");
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
    const user = setup(missing("/?tools=postgres&needs=ingest.reverse-etl"));
    const listed = gapButtons().find((b) => b.textContent?.includes("You need Reverse ETL"))!;
    expect(listed.textContent).toContain("side rail");

    await openTab(user, /Coverage/);
    await user.click(screen.getByText(/Not shown in the Medallion architecture lens/));
    const rail = document.querySelector(".rail")!;
    expect(within(rail as HTMLElement).getByRole("button", { name: /You need Reverse ETL/ })).toBeTruthy();
  });

  it("places the same gap in a zone in the audit grid", async () => {
    setup(missing("/?tools=postgres&needs=ingest.reverse-etl&lens=grid"));
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
    const user = setup(missing());
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

describe("one thing at a time", () => {
  const tabNamed = (name: RegExp) => screen.getByRole("tab", { name });

  it("opens on coverage, with the gaps and overlaps a tab away and counted", () => {
    setup("/?tools=snowflake,dbt,github");
    expect(tabNamed(/Coverage/).getAttribute("aria-selected")).toBe("true");
    expect(tabNamed(/What.s missing/).textContent).toMatch(/\d+/);
    expect(tabNamed(/Overlaps/).textContent).toMatch(/\d+/);
    expect(screen.queryByRole("region", { name: "What’s missing" })).toBeNull();
    expect(document.querySelector(".gaplist")).toBeNull();
  });

  it("opens on the tab an address names, and writes the tab back to it", async () => {
    const user = setup("/?tools=postgres#missing");
    expect(tabNamed(/What.s missing/).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector(".gaplist")).toBeTruthy();

    await user.click(tabNamed(/Coverage/));
    expect(window.location.hash).toBe("");
    expect(document.querySelector(".matrix")).toBeTruthy();
    await user.click(tabNamed(/What.s missing/));
    expect(window.location.hash).toBe("#missing");
  });

  it("falls back to coverage when the tab asked for has nothing to show", () => {
    setup("/?tools=aws-s3#overlaps");
    expect(tabNamed(/Coverage/).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("tab", { name: /Overlaps/ })).toBeNull();
  });

  it("moves between the tabs with the arrow keys", async () => {
    const user = setup("/?tools=postgres");
    tabNamed(/Coverage/).focus();
    await user.keyboard("{ArrowRight}");
    expect(tabNamed(/What.s missing/).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabNamed(/What.s missing/));
  });

  it("puts the ties that need a decision first, and folds the tasks where one tool clearly leads", () => {
    setup(overlapsTab("/?tools=snowflake,dbt,github"));
    const open = document.querySelectorAll('.overlap[data-tie="true"]');
    expect(open.length).toBeGreaterThan(0);
    const fold = document.querySelector(".overlaps details.fold") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")!.textContent).toMatch(/more tasks? where one tool clearly leads/);
    expect(fold.querySelectorAll('.overlap[data-tie="true"]').length).toBe(0);
  });

  it("keeps the colour key behind a fold on the chart", () => {
    setup("/?tools=dbt-core");
    const legend = document.querySelector("details.legend") as HTMLDetailsElement;
    expect(legend.open).toBe(false);
    expect(legend.querySelector("summary")!.textContent).toMatch(/How to read/);
  });

  it("keeps each example's notice behind a fold, with the way to load it in plain view", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Start from an example/ }));
    const cards = document.querySelectorAll(".excard");
    expect(cards.length).toBeGreaterThan(10);
    for (const c of Array.from(cards)) {
      expect((c.querySelector("details.fold") as HTMLDetailsElement).open).toBe(false);
      expect(c.querySelector("button.primary")).toBeTruthy();
    }
  });

  it("keeps the reasoning behind a rank behind a fold, and the way to close the gap in view", async () => {
    const user = setup(missing("/?tools=aws-s3"));
    await user.click(gapButtons().find((b) => /^Masking is missing/.test(b.querySelector(".gap__title")?.textContent ?? ""))!);
    const dialog = screen.getByRole("dialog");
    const fold = dialog.querySelector("details.fold") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.textContent).toContain("Criticality");
    expect(within(dialog).getByRole("heading", { name: "What would close it" })).toBeTruthy();
    // What to do about it comes before why it ranks where it does.
    const order = Array.from(dialog.querySelectorAll("h3, summary")).map((n) => n.textContent);
    expect(order.findIndex((t) => t === "What would close it")).toBeLessThan(order.findIndex((t) => /^Why it ranks/.test(t ?? "")));
  });
});

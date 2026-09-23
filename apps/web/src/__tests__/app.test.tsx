// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeGaps } from "@compile";
import { Builder, Root } from "../App";
import { model } from "./fixture";

/**
 * Sets a controlled `<input type="range">`'s value the way a real drag does. `fireEvent`'s own
 * `target: { value }` already does the native-setter bypass React's controlled inputs need — but a
 * single dispatch is silently dropped on the rare occasion the target equals the slider's own
 * current (possibly uncommitted-default) position, since React's value tracker then sees no change
 * at all. A real drag always passes through some other value first, so this does too when needed.
 */
function setSliderValue(input: HTMLInputElement, value: string) {
  if (input.value === value) fireEvent.input(input, { target: { value: value === "0" ? "1" : "0" } });
  fireEvent.input(input, { target: { value } });
}

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
/** Adding and removing tools lives in the "Edit stack" panel now, one click away from what's missing. */
const openEditor = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Edit stack" }));
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
    await openEditor(user);
    await openVendor(user, "Amazon Web Services");
    await user.click(screen.getByRole("checkbox", { name: /Amazon S3/ }));

    expect(within(chips()).getByText("Amazon S3")).toBeTruthy();
    expect(screen.queryByText("Nothing in your stack covers Store")).toBeNull();
    expect(screen.getByText("Nothing in your stack covers Serve")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toBe("?tools=aws-s3"));
  });

  it("adds every service of a portfolio at once, and only its services", async () => {
    const user = setup();
    await openEditor(user);
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
    await openEditor(user);
    await openVendor(user, "Amazon Web Services");
    await user.click(within(vendorHead("Amazon Web Services")).getByRole("button", { name: `Add all ${awsServices} services` }));
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(awsServices);
    expect(within(chips()).getByText("AWS Glue")).toBeTruthy();
  });

  it("removes a tool", async () => {
    const user = setup("/?tools=postgres,dbt-core");
    await openEditor(user);
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
    const user = setup("/?tools=postgres,dbt-core&needs=ingest.cdc");
    expect(screen.getByRole("group", { name: /Where your tools sit in the Audit grid lens/ })).toBeTruthy();
    await openEditor(user);
    expect(within(chips()).getByText("PostgreSQL")).toBeTruthy();
    await user.keyboard("{Escape}");
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
    await openEditor(user);
    expect(within(chips()).getByText("BigQuery")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("ML serving")).toBeTruthy();
  });

  it("loads an example without opening anything unasked, now that a tier is assumed from volume rather than chosen per tool", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Start from an example/ }));
    await user.click(screen.getByRole("button", { name: "Load Snowflake, dbt and GitHub" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears an answered volume when a different example is loaded, so it never wrongly follows a demo stack", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Start from an example/ }));
    await user.click(screen.getByRole("button", { name: "Load Snowflake, dbt and GitHub" }));
    setSliderValue(screen.getByRole("slider") as HTMLInputElement, "1000"); // max, exactly 1,048,576 GB
    await waitFor(() => expect(window.location.search).toContain("volume=1048576"));

    await user.click(screen.getByRole("button", { name: "Guided start" }));
    await user.click(screen.getByRole("button", { name: /Start from an example/ }));
    await user.click(screen.getByRole("button", { name: "Load Databricks lakehouse" }));
    expect(window.location.search).not.toContain("volume=");
  });

  it("prompts for the pipeline's scale on Coverage, no matter how the stack was built", async () => {
    // A hand-built stack (setup with tools already in the URL) sees the same prompt as a loaded example.
    setup("/?tools=snowflake#coverage");
    expect(screen.getByText(/What.s the scale of this pipeline/)).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Pipeline volume per month" })).toBeTruthy();
  });

  it("shows an approximate total once volume is answered, and updates it when volume changes", async () => {
    const user = setup("/?tools=snowflake#coverage");
    setSliderValue(screen.getByRole("slider") as HTMLInputElement, "500"); // exactly 1024 GB, a sourced checkpoint
    await waitFor(() => expect(window.location.search).toContain("volume=1024"));
    expect(screen.getByText(/\$200–\$600\/mo at 1\.0 TB\/month/)).toBeTruthy();
    expect(screen.getByText(/Approximate, as of the date shown/)).toBeTruthy();

    // Changing volume shows a different total, not the same one relabelled — no separate "answered" state to re-ask.
    setSliderValue(screen.getByRole("slider") as HTMLInputElement, "1000"); // exactly 1,048,576 GB (1PB)
    await waitFor(() => expect(window.location.search).toContain("volume=1048576"));
    expect(screen.getByText(/\$25,000–\$70,000\/mo at 1\.00 PB\/month/)).toBeTruthy();
  });

  it("names the source and date behind a tool's own cost estimate in the breakdown fold", async () => {
    const user = setup("/?tools=snowflake&volume=1024#coverage");
    await user.click(screen.getByText("Per-tool breakdown"));
    const breakdown = document.querySelector<HTMLElement>(".costpanel__breakdown")!;
    expect(within(breakdown).getByText("Snowflake")).toBeTruthy();
    expect(within(breakdown).getByText(/\$200–\$600\/mo/)).toBeTruthy();
    expect(within(breakdown).getByText(/as of 2026-09-23/)).toBeTruthy();
    expect(within(breakdown).getByRole("link")).toBeTruthy();
  });

  it("also asks in the Edit Stack panel, but only while unanswered", async () => {
    const user = setup("/?tools=snowflake#coverage");
    await openEditor(user);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/What.s the scale of this pipeline/)).toBeTruthy();

    setSliderValue(within(dialog).getByRole("slider") as HTMLInputElement, "500");
    await waitFor(() => expect(window.location.search).toContain("volume=1024"));
    // Answered: the total lives on Coverage, not duplicated in the edit panel.
    expect(within(dialog).queryByText(/What.s the scale of this pipeline/)).toBeNull();
    expect(within(dialog).queryByText(/\/mo at/)).toBeNull();
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

    expect(title()).toBe("How many people work on this?");
    await user.click(screen.getByRole("radio", { name: "Just me" }));
    await next(user);

    expect(title()).toBe("Does the data include anything sensitive or regulated?");
    await user.click(screen.getByRole("radio", { name: /No personal, financial or health data/ }));
    await next(user);

    expect(title()).toBe("What happens with this data?");
    await next(user); // skipped

    expect(title()).toBe("What do you already have?");
    await user.click(screen.getByRole("checkbox", { name: /Prefer free and open-source/ }));
    await next(user);

    expect(title()).toBe("How much does it move and run?");
    setSliderValue(screen.getByRole("slider") as HTMLInputElement, "500"); // the slider's geometric midpoint, exactly 1024 GB
    await next(user);

    expect(title()).toBe("Here is your stack");
    const review = document.querySelector(".landing")!.textContent!;
    expect(review).toContain("Snowflake");
    expect(review).toContain("Amazon S3");
    expect(review).toContain("BI and visualisation");
    expect(review).toContain("Just me");
    expect(review).toContain("Prefer free and open-source");
    expect(review).toContain("1.0 TB/month");

    await user.click(screen.getByRole("button", { name: "Show me my stack" }));
    expect(screen.getByRole("heading", { name: "Coverage by stage" })).toBeTruthy();
    await openEditor(user);
    expect(within(chips()).getByText("Snowflake")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("BI and visualisation")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toContain("needs=serve.bi-viz"));
    await waitFor(() => expect(window.location.search).toContain("profile=team:solo,sensitivity:none"));
    await waitFor(() => expect(window.location.search).toContain("resources=prefer-oss"));
  });

  it("does not say nothing was picked once the profile or resources questions were answered", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /Build my own/ }));
    for (let i = 0; i < 6; i += 1) await next(user); // 5 tool steps + needs, none picked
    await user.click(screen.getByRole("radio", { name: "Just me" }));
    for (let i = 0; i < 5; i += 1) await next(user); // team, sensitivity, stakes, resources, scale
    expect(title()).toBe("Here is your stack");
    expect(screen.queryByText(/have not picked anything yet/)).toBeNull();
    expect(screen.getByText(/what you told us about the project/)).toBeTruthy();
    expect(screen.getByText("Just me")).toBeTruthy();
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
    for (let i = 0; i < 5; i += 1) await next(user); // profile x3, resources, scale, all skipped
    await user.click(screen.getByRole("button", { name: "Show me my stack" }));
    await openEditor(user);
    await user.click(screen.getByRole("tab", { name: /What you need/ }));
    expect((screen.getByRole("checkbox", { name: /Feature engineering/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /ML serving/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("lets someone who knows their stack skip straight to the builder", async () => {
    const user = setupLanding();
    await user.click(screen.getByRole("button", { name: /go straight to the builder/ }));
    expect(screen.getByRole("heading", { name: "Coverage by stage" })).toBeTruthy();
  });

  it("goes straight to the guidance for an address that already carries a stack", async () => {
    const user = setupLanding("/?tools=postgres");
    expect(screen.queryByRole("heading", { name: "How would you like to start?" })).toBeNull();
    await openEditor(user);
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

    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "Remove dbt (v2)" }));
    await waitFor(() => expect(window.location.search).not.toContain("use="));
  });

  it("scores the task by the tool you use, and shows it in the tool's row", async () => {
    const user = setup("/?tools=aws-mwaa,github#coverage");
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
    const user = setup(`${stack}&use=transform.sql-transform:dbt#coverage`);
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
    setup("/?tools=aws-s3,aws-lake-formation,azure-monitor#coverage");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    expect(within(matrix).getByRole("heading", { name: "Cross-cutting tools" })).toBeTruthy();
    const rows = Array.from(matrix.querySelectorAll(".lane__label")).map((n) => n.textContent);
    expect(rows.some((t) => t?.startsWith("AWS Lake Formation"))).toBe(true);
    expect(rows.some((t) => t?.startsWith("Azure Monitor"))).toBe(true);
    expect(screen.queryByText(/with no position in the pipeline/)).toBeNull();
  });

  it("say which concerns they cover, and mark their reach across the zones", () => {
    setup("/?tools=aws-lake-formation#coverage");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    expect(matrix.textContent).toContain("Govern");
    expect(within(matrix).getAllByRole("button", { name: /AWS Lake Formation, .*cross-cutting/ }).length).toBeGreaterThan(1);
  });

  it("do not disturb the pipeline rows of the tools beside them", () => {
    setup("/?tools=aws-s3,aws-lake-formation#coverage");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    const rows = Array.from(matrix.querySelectorAll(".lane__label")).map((n) => n.textContent);
    expect(rows.some((t) => t?.startsWith("Amazon S3"))).toBe(true);
  });

});

describe("the stage strip", () => {
  it("names every tool in a stage, including one that another beats on every capability", () => {
    setup("/?tools=aws-mwaa,github#coverage");
    const strip = screen.getByRole("list", { name: "Coverage by stage" });
    const orchestrate = within(strip).getAllByRole("listitem").find((li) => li.textContent?.startsWith("Orchestrate"))!;
    expect(orchestrate.textContent).toContain("Amazon MWAA");
    expect(orchestrate.textContent).toContain("GitHub");
  });

  it("shows the actual criticality on an empty stage that matters, and stays plain where it never does", () => {
    setup("/#coverage");
    const strip = screen.getByRole("list", { name: "Coverage by stage" });
    const items = within(strip).getAllByRole("listitem");
    const store = items.find((li) => li.textContent?.startsWith("Store"))!;
    expect(within(store).getByText("Critical")).toBeTruthy();
    expect(within(store).getByText("5")).toBeTruthy();
    const source = items.find((li) => li.textContent?.startsWith("Source"))!;
    expect(source.textContent).toContain("Usually outside your stack");
    expect(within(source).queryByText("Critical")).toBeNull();
  });
});

describe("finding a tool", () => {
  it("starts with vendors folded, so the list is short", async () => {
    const user = setup();
    await openEditor(user);
    expect(screen.queryByRole("checkbox", { name: /Amazon S3/ })).toBeNull();
    expect(within(vendorHead("Amazon Web Services")).getByRole("button", { name: "Amazon Web Services", expanded: false })).toBeTruthy();
  });

  it("opens the matching vendors when you search, and says how many matched", async () => {
    const user = setup();
    await openEditor(user);
    await user.type(screen.getByRole("searchbox", { name: "Find a tool" }), "glue");
    expect(screen.getByRole("checkbox", { name: /AWS Glue/ })).toBeTruthy();
    expect(pickerCount()?.textContent).toMatch(/1 tool in 1 vendor/);
  });

  it("narrows to tools that cover a stage, and back again", async () => {
    const user = setup();
    await openEditor(user);
    await user.selectOptions(screen.getByRole("combobox", { name: /Covers/ }), "orchestrate");
    expect(screen.getByRole("checkbox", { name: /dbt OSS/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Amazon S3/ })).toBeNull();
    await user.selectOptions(screen.getByRole("combobox", { name: /Covers/ }), "");
    expect(pickerCount()).toBeNull();
  });

  it("says so when nothing matches", async () => {
    const user = setup();
    await openEditor(user);
    await user.type(screen.getByRole("searchbox", { name: "Find a tool" }), "zzzz");
    expect(pickerCount()?.textContent).toContain("No tool matches");
  });

  it("shows how many tools you have added to a folded vendor", async () => {
    const user = setup("/?tools=aws-s3,aws-glue");
    await openEditor(user);
    expect(within(vendorHead("Amazon Web Services").parentElement!).getByText("2 added")).toBeTruthy();
  });
});

describe("saying what you need", () => {
  it("keeps needs one tab away, with a count, and shows the ones you picked beside your tools", async () => {
    const user = setup("/?tools=postgres&needs=ingest.cdc");
    await openEditor(user);
    const tab = screen.getByRole("tab", { name: /What you need/ });
    expect(tab.textContent).toContain("1");
    expect(within(screen.getByRole("list", { name: "Selected needs" })).getByText("Change data capture")).toBeTruthy();

    await user.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("checkbox", { name: /Change data capture/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("drops a need from its chip", async () => {
    const user = setup("/?tools=postgres&needs=ingest.cdc");
    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "Stop needing Change data capture" }));
    expect(screen.queryByRole("list", { name: "Selected needs" })).toBeNull();
    await waitFor(() => expect(window.location.search).toBe("?tools=postgres"));
  });

  it("moves between the two tabs with the arrow keys", async () => {
    const user = setup();
    await openEditor(user);
    screen.getByRole("tab", { name: /Tools you have/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /What you need/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /What you need/ }));
  });
});

describe("needs", () => {
  it("flags something you said you need and your tools lack, ahead of everything else", async () => {
    const user = setup(missing("/?tools=postgres"));
    await openEditor(user);
    await showNeeds(user);
    await user.click(screen.getByRole("checkbox", { name: /Change data capture/ }));
    const top = gapButtons()[0]!;
    expect(top.textContent).toContain("You need Change data capture, and nothing provides it");
    expect(top.textContent).toContain("Critical");
  });

  it("stops flagging a need once a tool provides it", async () => {
    const user = setup(missing("/?tools=postgres&needs=ingest.cdc"));
    expect(screen.getByText("You need Change data capture, and nothing provides it")).toBeTruthy();
    await openEditor(user);
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

  it("names the actual plan a gap is closable on, not a generic \"Enterprise plan\"", async () => {
    const user = setup(missing("/?tools=snowflake,dbt,github"));
    const masking = gapButtons().find((b) => /^Masking is missing/.test(b.querySelector(".gap__title")?.textContent ?? ""))!;
    expect(masking.textContent).toContain("closable on Snowflake Enterprise edition");
    await user.click(masking);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("on Snowflake Enterprise edition, via Snowflake Horizon Catalog");
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

describe("profile and resources", () => {
  it("pre-fills set aside for what a profile answer confirms, straight from a shared link", () => {
    setup(missing("/?tools=aws-s3&profile=sensitivity:none"));
    const titles = gapButtons().map((b) => b.querySelector(".gap__title")?.textContent);
    expect(titles.some((t) => t?.startsWith("Masking"))).toBe(false);
    expect(screen.getByText(/capabilit(y|ies) set aside as not relevant/)).toBeTruthy();
  });

  it("still lets a pre-filled capability be brought back, same as a manual one", async () => {
    const user = setup(missing("/?tools=aws-s3&profile=sensitivity:none"));
    await user.click(screen.getByText(/capabilit(y|ies) set aside as not relevant/));
    await user.click(screen.getAllByRole("button", { name: /^Bring back: / })[0]!);
    const titles = gapButtons().map((b) => b.querySelector(".gap__title")?.textContent);
    expect(titles.some((t) => t?.startsWith("Masking") || t?.startsWith("Policy") || t?.startsWith("Access"))).toBe(true);
  });

  it("orders a gap's suggestions by the resources answered, open-source ahead of an equally good paid tool", async () => {
    const user = setup(missing("/?resources=prefer-oss"));
    const transformGap = gapButtons().find((b) => b.textContent?.includes("Nothing in your stack covers Transform"))!;
    await user.click(transformGap);
    const dialog = screen.getByRole("dialog");
    const showAll = within(dialog).queryByRole("button", { name: /Show all/ });
    if (showAll) await user.click(showAll);
    const names = within(dialog)
      .getAllByRole("button")
      .filter((b) => b.classList.contains("linkish") && b.closest(".suggestion"))
      .map((b) => b.textContent);
    expect(names.indexOf("dbt OSS (dbt Core)")).toBeLessThan(names.indexOf("Databricks Runtime and Delta Lake"));
  });
});

describe("the lens", () => {
  it("always shows the audit grid: the six pipeline stages, with no switcher and no table twin", () => {
    setup("/?tools=aws-s3,aws-glue#coverage");
    const chart = within(screen.getByRole("main"));
    expect(chart.getByRole("button", { name: "Orchestrate" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Audit grid" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Medallion architecture" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Table" })).toBeNull();
    expect(screen.queryByRole("table", { name: /Where your tools sit/ })).toBeNull();
  });

  it("places every gap in its own stage's zone: the grid has a zone for all six", async () => {
    const user = setup(missing("/?tools=postgres&needs=ingest.reverse-etl"));
    const listed = gapButtons().find((b) => b.textContent?.includes("You need Reverse ETL"))!;
    expect(listed.textContent).toContain("Needed · Ingest");
    expect(listed.textContent).not.toContain("side rail");

    await openTab(user, /Coverage/);
    expect(screen.queryByText(/Not shown in the Audit grid lens/)).toBeNull();
  });
});

describe("the marks", () => {
  it("name the tool, the zone and the level in words, so nothing depends on colour", () => {
    setup("/?tools=dbt-core#coverage");
    const marks = screen.getAllByRole("button").filter((b) => b.classList.contains("mark"));
    const labels = marks.map((m) => m.getAttribute("aria-label")!);
    expect(labels).toContain("dbt OSS (dbt Core), Transform: Core, core position");
    expect(labels.some((l) => l.startsWith("dbt OSS (dbt Core), Orchestrate") && !l.includes("core position"))).toBe(true);
  });

  it("fades the mark of a tool that lost an overlap decision, at the zone it lost, and leaves the winner alone", () => {
    setup("/?tools=snowflake,dbt,github#coverage");
    const marks = screen.getAllByRole("button").filter((b) => b.classList.contains("mark"));
    // GitHub leads scheduling by score, so it drives Orchestrate; Snowflake also covers it but is not used there.
    const github = marks.find((m) => m.getAttribute("aria-label")?.startsWith("GitHub (with Actions), Orchestrate"))!;
    const snowflake = marks.find((m) => m.getAttribute("aria-label")?.startsWith("Snowflake, Orchestrate"))!;
    expect(github.classList.contains("mark--shadow")).toBe(false);
    expect(snowflake.classList.contains("mark--shadow")).toBe(true);
    expect(snowflake.getAttribute("aria-label")).toContain("not the tool used here");
  });

  it("shows an always-visible key for colour and level, not only behind a fold", () => {
    setup("/?tools=dbt-core#coverage");
    expect(screen.getByText(/Colour says what a tool does to the data/)).toBeTruthy();
    const legend = document.querySelector("details.legend") as HTMLDetailsElement;
    expect(legend.open).toBe(false);
  });

  it("names who provides a cross-cutting band, not just a bare colour bar", () => {
    setup("/?tools=aws-lake-formation#coverage");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    const govern = Array.from(matrix.querySelectorAll(".lane__label--band")).find((n) => n.textContent?.startsWith("Govern"))!;
    expect(govern.textContent).toContain("AWS Lake Formation");
  });

  it("gives a fourth colour family to the roles that watch or coordinate rather than hold or move data", () => {
    setup("/?tools=aws-lake-formation,aws-s3#coverage");
    const matrix = screen.getByRole("group", { name: /Where your tools sit/ });
    const labelFor = (name: string) => Array.from(matrix.querySelectorAll(".lane__label")).find((n) => n.textContent?.startsWith(name))!;
    expect(labelFor("AWS Lake Formation").querySelector(".lane__glyph")!.getAttribute("data-ramp")).toBe("oversight");
    expect(labelFor("Amazon S3").querySelector(".lane__glyph")!.getAttribute("data-ramp")).toBe("structural");
  });

  it("flags a zone nothing covers in the column header itself, not only at the bottom", () => {
    setup("/#coverage");
    const matrix = within(screen.getByRole("group", { name: /Where your tools sit/ }));
    const store = matrix.getByRole("button", { name: /^Store/ });
    expect(store.querySelector(".zonehead__gap")).toBeTruthy();
    const source = matrix.getByRole("button", { name: "Source" });
    expect(source.querySelector(".zonehead__gap")).toBeNull();
  });

  it("show a tooltip on hover and on focus, and hide it after", async () => {
    const user = setup("/?tools=dbt-core#coverage");
    const mark = screen.getAllByRole("button").find((b) => b.getAttribute("aria-label")?.startsWith("dbt OSS (dbt Core), Transform"))!;

    await user.hover(mark);
    expect(screen.getByText("Click for notes and sources")).toBeTruthy();
    await user.unhover(mark);
    expect(screen.queryByText("Click for notes and sources")).toBeNull();

    mark.focus();
    await waitFor(() => expect(screen.getByText("Click for notes and sources")).toBeTruthy());
  });

  it("says a mark is built in rather than leaving Core and Native as bare, unexplained words", async () => {
    const user = setup("/?tools=dbt-core#coverage");
    const core = screen.getAllByRole("button").find((b) => b.getAttribute("aria-label")?.startsWith("dbt OSS (dbt Core), Transform"))!;
    await user.hover(core);
    expect(screen.getByText(/Built in \(Core\)/)).toBeTruthy();
  });

  it("says a plugin is needed for an Extended mark, not just the bare word", async () => {
    // pg_cron gives Postgres scheduling as a community extension, at level 1 (Extended).
    const user = setup("/?tools=postgres#coverage");
    const extended = screen.getAllByRole("button").find((b) => b.getAttribute("aria-label")?.includes("Extended"))!;
    await user.hover(extended);
    expect(screen.getByText(/Needs a plugin or add-on \(Extended\)/)).toBeTruthy();
  });

  it("names the tool and its level for a cross-cutting cell on hover, not just a colour block", async () => {
    const user = setup("/?tools=aws-lake-formation#coverage");
    const bandMark = document.querySelector(".bandmark:not(.bandmark--none)") as HTMLElement;
    await user.hover(bandMark);
    expect(screen.getByText(/AWS Lake Formation — (Core|Native|Extended)/)).toBeTruthy();
  });

  it("renders the tooltip outside the scrolling matrix, so it is never clipped by its scrollbar", async () => {
    const user = setup("/?tools=dbt-core#coverage");
    const mark = screen.getAllByRole("button").find((b) => b.getAttribute("aria-label")?.startsWith("dbt OSS (dbt Core), Transform"))!;
    await user.hover(mark);
    const tip = document.querySelector(".tooltip")!;
    expect(document.querySelector(".matrix-wrap")!.contains(tip)).toBe(false);
    expect(document.body.contains(tip)).toBe(true);
  });

  it("count gaps at the worst tier in a zone, not every gap that touches it", () => {
    setup("/?tools=databricks,dbt-platform#coverage");
    const chip = screen.getAllByRole("button").find((b) => b.classList.contains("gapchip") && b.getAttribute("aria-label")?.includes("Source"))!;
    expect(chip.getAttribute("aria-label")).toMatch(/^\d+ serious gaps? and \d+ lower in Source$/);
  });
});

describe("receipts", () => {
  it("open a tool to its scores, each with a note and an https source link", async () => {
    const user = setup("/?tools=dbt-core");
    await openEditor(user);
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
    await openEditor(user);
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

  it("show a higher plan's level as a note, never as coverage, naming the plan by its own name", async () => {
    const user = setup("/?tools=dbt-platform-services");
    await openEditor(user);
    await user.click(within(chips()).getByRole("button", { name: "dbt platform (hosted services)" }));
    const dialog = screen.getByRole("dialog");
    // Named from the record's own tier_name, not the generic "an Enterprise plan".
    expect(dialog.textContent).toMatch(/Reaches core only on dbt platform Enterprise or Enterprise\+ plan/);
    expect(dialog.textContent).toContain("Not counted as coverage");
  });

  it("assumes a tool is on its higher tier at or above the enterprise-tier volume, promoting what it gates into real coverage, everywhere", async () => {
    const user = setup(missing("/?tools=dbt-platform-services&needs=orchestrate.dependency-dag"));
    const dagGap = () => gapButtons().some((b) => /Dependency DAG/.test(b.textContent ?? ""));
    expect(dagGap()).toBe(true);

    await openTab(user, /Coverage/);
    setSliderValue(screen.getByRole("slider") as HTMLInputElement, "1000"); // max, well above the 10TB/month threshold
    await waitFor(() => expect(window.location.search).toContain("volume=1048576"));

    await openEditor(user);
    await user.click(within(chips()).getByRole("button", { name: "dbt platform (hosted services)" }));
    // The tool's own receipts now count it, not just note it, with a read-only line saying why.
    expect(screen.queryByText(/Reaches core only on/)).toBeNull();
    expect(screen.getByText(/Counted as covered: at this volume, we assume this is on dbt platform Enterprise or Enterprise\+ plan/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close details" }));
    await openTab(user, /What.s missing/);
    // The gap needing exactly what the assumed tier now provides is gone.
    expect(dagGap()).toBe(false);
  });

  it("does not assume a higher tier below the enterprise-tier volume threshold", async () => {
    const user = setup("/?tools=snowflake&volume=1024"); // 1TB/month, well under the 10TB threshold
    await openEditor(user);
    await user.click(within(chips()).getByRole("button", { name: "Snowflake" }));
    expect(screen.queryByText(/Counted as covered: at this volume/)).toBeNull();
  });

  it("open a gap to why it matters and what would close it, and let you add a fix", async () => {
    const user = setup(missing());
    await user.click(gapButtons()[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "What goes wrong without it" })).toBeTruthy();
    expect(dialog.textContent).toContain("Criticality 5 of 5");
    expect(within(dialog).getByRole("heading", { name: "What would close it" })).toBeTruthy();

    await user.click(within(dialog).getAllByRole("button", { name: /^Add .* to your stack$/ })[0]!);
    // The fix closed the very gap being read.
    expect(within(screen.getByRole("dialog")).getByText("This gap is closed in your current stack.")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toMatch(/tools=/));
  });

  it("open a zone to the tools, cross-cutting coverage and gaps in it", async () => {
    const user = setup("/?tools=dbt-core#coverage");
    await user.click(screen.getByRole("button", { name: "Transform" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Transform" })).toBeTruthy();
    expect(dialog.textContent).toContain("dbt OSS (dbt Core)");
    expect(dialog.textContent).toContain("Cross-cutting here");
  });

  it("close with Escape or the close button", async () => {
    const user = setup("/?tools=dbt-core");
    await openEditor(user);
    await user.click(within(chips()).getByRole("button", { name: "dbt OSS (dbt Core)" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await openEditor(user);
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
    expect(screen.queryByRole("group", { name: /Where your tools sit/ })).toBeTruthy();
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
    // Only the selected tab is in the natural tab order; a keyboard user reaches the tablist here first.
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
    setup("/?tools=dbt-core#coverage");
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

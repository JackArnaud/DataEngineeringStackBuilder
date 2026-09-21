import { useEffect, useMemo, useState } from "react";
import { computeGaps, groupGaps, projectGaps, stackBands } from "@compile";
import type { Gap, RenderModel, RenderTool } from "@compile";
import { DetailPanel } from "./components/Detail";
import { Landing } from "./components/Landing";
import { OverlapList } from "./components/OverlapList";
import { Actions, ViewControls } from "./components/FilterRow";
import { GapList } from "./components/GapList";
import { Legend } from "./components/Legend";
import { LensMatrix } from "./components/LensMatrix";
import { StackPanel } from "./components/StackPanel";
import { StageStrip } from "./components/StageStrip";
import { TabBar, panelId, tabId } from "./components/TabBar";
import { buildLookup } from "./lookup";
import { useRenderModel } from "./model";
import { add, emptyState, parseState, serializeState, toggle } from "./state";
import type { StackState } from "./state";
import type { Detail } from "./types";

type MainTab = "coverage" | "missing" | "overlaps";
const MAIN_TABS: MainTab[] = ["coverage", "missing", "overlaps"];

/** The tab an address asks for, so a link can open on the gaps. Anything else opens on coverage. */
const tabFromHash = (): MainTab => {
  const id = window.location.hash.replace(/^#/, "");
  return (MAIN_TABS as string[]).includes(id) ? (id as MainTab) : "coverage";
};

/** Loads the render model, the only data the site reads, then hands it to the builder. */
export function Root() {
  const [loaded, retry] = useRenderModel(`${import.meta.env.BASE_URL}render-model.json`);
  if (loaded.status === "loading") {
    return (
      <p className="status" role="status">
        Loading the data…
      </p>
    );
  }
  if (loaded.status === "error") {
    return (
      <div className="status" role="alert">
        <p>{loaded.message}</p>
        <button type="button" className="secondary" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return <Builder model={loaded.model} startOnLanding />;
}

/**
 * `startOnLanding` opens the guided start for a visitor with nothing chosen. An address that already
 * carries a stack goes straight to the builder, so a shared link shows what was shared.
 */
export function Builder({ model, startOnLanding = false }: { model: RenderModel; startOnLanding?: boolean }) {
  const lookup = useMemo(() => buildLookup(model), [model]);
  const [state, setState] = useState<StackState>(() => parseState(window.location.search, model));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTabState] = useState<MainTab>(tabFromHash);
  const setTab = (next: MainTab) => {
    setTabState(next);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next === "coverage" ? "" : `#${next}`}`);
  };
  const [mode, setMode] = useState<"landing" | "builder">(() => {
    const initial = parseState(window.location.search, model);
    return startOnLanding && initial.tools.length === 0 && initial.needs.length === 0 ? "landing" : "builder";
  });

  // The address is the state: copy it and someone else sees the same stack.
  useEffect(() => {
    const next = `${window.location.pathname}${serializeState(state, model)}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", next);
  }, [state, model]);

  useEffect(() => {
    const onPop = () => setState(parseState(window.location.search, model));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [model]);

  const change = (patch: Partial<StackState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      // A choice of tool for a task goes when the tool does.
      if (patch.tools) next.use = Object.fromEntries(Object.entries(next.use).filter(([, tool]) => next.tools.includes(tool)));
      return next;
    });

  const report = useMemo(() => computeGaps(model, { tools: state.tools, needs: state.needs, use: state.use }), [model, state.tools, state.needs, state.use]);
  // A capability the user set aside is left out of the list and the matrix alike, so the two agree.
  // The report itself stays the full, factual set.
  const { gaps, setAside } = useMemo(() => {
    const skip = new Set(state.skip);
    const isSkipped = (g: Gap) => g.kind === "band" && skip.has(g.capability!);
    return { gaps: report.gaps.filter((g) => !isSkipped(g)), setAside: report.gaps.filter(isSkipped) };
  }, [report.gaps, state.skip]);
  const lens = model.lenses.find((l) => l.id === state.lens) ?? model.lenses[0]!;
  const placement = useMemo(() => projectGaps(model, lens.id, gaps), [model, lens.id, gaps]);
  const bands = useMemo(() => stackBands(model, lens.id, state.tools), [model, lens.id, state.tools]);
  const tools = useMemo(() => state.tools.map((id) => lookup.tool(id)).filter((t): t is RenderTool => !!t), [state.tools, lookup]);

  const canReset = state.tools.length > 0 || state.needs.length > 0 || state.skip.length > 0 || Object.keys(state.use).length > 0;
  const reset = () => {
    setState(emptyState(model));
    setDetail(null);
    if (startOnLanding) setMode("landing");
  };

  if (mode === "landing") {
    return (
      <div className="app">
        <header className="top">
          <h1>Data stack builder</h1>
        </header>
        <main>
        <Landing
          model={model}
          lookup={lookup}
          state={state}
          onChange={change}
          onDone={() => setMode("builder")}
          onLoadExample={(e) => {
            change({ tools: [...e.tools], needs: e.needs ?? [], skip: [], use: {} });
            setMode("builder");
          }}
        />
        </main>
      </div>
    );
  }

  // Overlaps only get a tab while there is something to say; a link to a tab that is gone shows coverage.
  const active: MainTab = tab === "overlaps" && report.overlaps.length === 0 ? "coverage" : tab;
  const tabs = [
    { id: "coverage" as const, label: "Coverage" },
    { id: "missing" as const, label: "What\u2019s missing", count: groupGaps(model, gaps).length },
    ...(report.overlaps.length > 0 ? [{ id: "overlaps" as const, label: "Overlaps", count: report.overlaps.length }] : []),
  ];

  return (
    <div className="app">
      <header className="top">
        <h1>Data stack builder</h1>
        <Actions canReset={canReset} onReset={reset} onGuide={startOnLanding ? () => setMode("landing") : undefined} />
      </header>

      <div className="layout">
        <aside className="side" aria-label="Build your stack">
          <StackPanel model={model} lookup={lookup} state={state} onChange={change} onOpenTool={(id) => setDetail({ kind: "tool", id })} />
        </aside>

        <main className="main">
          {state.tools.length === 0 && (
            <p className="emptyhint">
              Nothing picked yet. Choose tools on the left, or{" "}
              <button type="button" className="linkish" onClick={() => setMode("landing")}>
                use the guided start
              </button>
              .
            </p>
          )}

          <TabBar tabs={tabs} value={active} onChange={setTab} prefix="main" label="Your stack" large />

          <div role="tabpanel" id={panelId("main", active)} aria-labelledby={tabId("main", active)} className="mainpanel">
            {active === "coverage" && (
              <>
                <section aria-labelledby="coverage">
                  <h2 id="coverage" className="sr-only">
                    Coverage by stage
                  </h2>
                  <StageStrip model={model} lookup={lookup} report={report} />
                </section>

                <section aria-labelledby="where">
                  <div className="sectionhead">
                    <h2 id="where">Where your tools sit</h2>
                    <ViewControls model={model} state={state} onChange={change} />
                  </div>
                  <LensMatrix model={model} lookup={lookup} lens={lens} tools={tools} placement={placement} bands={bands} view={state.view} overlaps={report.overlaps} onOpen={setDetail} />
                  <Legend model={model} />
                </section>
              </>
            )}

            {active === "overlaps" && (
              <OverlapList
                lookup={lookup}
                overlaps={report.overlaps}
                onUse={(capability, tool) => {
                  const rest = Object.fromEntries(Object.entries(state.use).filter(([c]) => c !== capability));
                  change({ use: tool ? { ...rest, [capability]: tool } : rest });
                }}
              />
            )}

            {active === "missing" && (
              <section aria-labelledby="missing">
                <h2 id="missing" className="sr-only">
                  What’s missing
                </h2>
                <GapList model={model} lookup={lookup} lens={lens} gaps={gaps} setAside={setAside} placement={placement} hasTools={state.tools.length > 0} onOpen={(id) => setDetail({ kind: "gap", id })} onSkip={(c) => change({ skip: add(state.skip, c) })} onRestore={(c) => change({ skip: state.skip.filter((x) => x !== c) })} />
              </section>
            )}
          </div>
        </main>
      </div>

      {detail && (
        <DetailPanel
          model={model}
          lookup={lookup}
          lens={lens}
          state={state}
          report={report}
          placement={placement}
          bands={bands}
          detail={detail}
          onClose={() => setDetail(null)}
          onOpen={setDetail}
          onToggleTool={(id) => change({ tools: toggle(state.tools, id) })}
          onAddTools={(ids) => change({ tools: add(state.tools, ...ids) })}
        />
      )}
    </div>
  );
}

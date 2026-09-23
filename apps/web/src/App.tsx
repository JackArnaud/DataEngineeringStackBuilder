import { useEffect, useMemo, useState } from "react";
import { computeGaps, effectiveLens, groupGaps, hasEnterpriseTierUnlock, projectGaps, stackBands } from "@compile";
import type { Gap, RenderModel, RenderTool } from "@compile";
import { DetailPanel } from "./components/Detail";
import { Landing } from "./components/Landing";
import { OverlapList } from "./components/OverlapList";
import { Actions } from "./components/Actions";
import { GapList } from "./components/GapList";
import { Legend } from "./components/Legend";
import { LensMatrix } from "./components/LensMatrix";
import { StackBar } from "./components/StackBar";
import { StageStrip } from "./components/StageStrip";
import { TabBar, panelId, tabId } from "./components/TabBar";
import { buildLookup } from "./lookup";
import { useRenderModel } from "./model";
import { add, emptyState, parseState, profileSkips, serializeState, toggle } from "./state";
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
      // A choice of tool for a task goes when the tool does, and so does a tier confirmed for it.
      if (patch.tools) {
        next.use = Object.fromEntries(Object.entries(next.use).filter(([, tool]) => next.tools.includes(tool)));
        next.tiers = next.tiers.filter((id) => next.tools.includes(id));
      }
      // Answering a profile question pre-fills the same "set aside" a user could tick by hand; it
      // only ever adds, so a manual restore afterwards is never silently undone by a later change.
      if (patch.profile) next.skip = add(next.skip, ...profileSkips(model, next.profile));
      return next;
    });

  const report = useMemo(() => computeGaps(model, { tools: state.tools, needs: state.needs, use: state.use, tiers: state.tiers }), [model, state.tools, state.needs, state.use, state.tiers]);
  // A capability the user set aside is left out of the list and the matrix alike, so the two agree.
  // The report itself stays the full, factual set.
  const { gaps, setAside } = useMemo(() => {
    const skip = new Set(state.skip);
    const isSkipped = (g: Gap) => g.kind === "band" && skip.has(g.capability!);
    return { gaps: report.gaps.filter((g) => !isSkipped(g)), setAside: report.gaps.filter(isSkipped) };
  }, [report.gaps, state.skip]);
  // The only lens the app shows: its zones are the six pipeline stages, one to one.
  const lens = model.lenses.find((l) => l.id === "grid") ?? model.lenses[0]!;
  // With every confirmed tier's view swapped in, so the matrix agrees with the gap list.
  const effLens = useMemo(() => effectiveLens(lens, state.tiers), [lens, state.tiers]);
  const placement = useMemo(() => projectGaps(model, lens.id, gaps), [model, lens.id, gaps]);
  const bands = useMemo(() => stackBands(model, effLens, state.tools), [model, effLens, state.tools]);
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
            // Loading an example clears any hand-picked skips, but keeps what the profile already
            // said is not relevant to this person, since that describes them, not the old stack. It
            // also clears any tier confirmed for the old stack: which plan someone is actually on is
            // a fact about them applying to a tool they chose, not one that should silently follow a
            // demo stack they didn't pick.
            change({ tools: [...e.tools], needs: e.needs ?? [], skip: profileSkips(model, state.profile), use: {}, tiers: [] });
            setMode("builder");
            // An example can load a tool with an enterprise-only capability without ever showing the
            // checkbox for it — nobody would find that by clicking through tools one at a time, so
            // ask directly instead of leaving it for someone to discover.
            if (e.tools.some((id) => hasEnterpriseTierUnlock(lookup.tool(id)?.cells ?? []))) setDetail({ kind: "editStack" });
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

      <main className="main">
        <StackBar lookup={lookup} state={state} onEdit={() => setDetail({ kind: "editStack" })} onGuide={startOnLanding ? () => setMode("landing") : undefined} />

        <TabBar tabs={tabs} value={active} onChange={setTab} prefix="main" label="Your stack" large />

        <div role="tabpanel" id={panelId("main", active)} aria-labelledby={tabId("main", active)} className="mainpanel">
          {active === "missing" && (
            <section aria-labelledby="missing">
              <h2 id="missing" className="sr-only">
                What’s missing
              </h2>
              <GapList model={model} lookup={lookup} lens={lens} gaps={gaps} setAside={setAside} placement={placement} hasTools={state.tools.length > 0} onOpen={(id) => setDetail({ kind: "gap", id })} onSkip={(c) => change({ skip: add(state.skip, c) })} onRestore={(c) => change({ skip: state.skip.filter((x) => x !== c) })} />
            </section>
          )}

          {active === "coverage" && (
            <>
              <section aria-labelledby="coverage">
                <h2 id="coverage" className="sr-only">
                  Coverage by stage
                </h2>
                <StageStrip model={model} lookup={lookup} report={report} />
              </section>

              <section aria-labelledby="where">
                <h2 id="where">Where your tools sit</h2>
                <LensMatrix model={model} lookup={lookup} lens={effLens} tools={tools} stages={report.stages} placement={placement} bands={bands} overlaps={report.overlaps} onOpen={setDetail} />
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
        </div>
      </main>

      {detail && (
        <DetailPanel
          model={model}
          lookup={lookup}
          lens={effLens}
          state={state}
          report={report}
          placement={placement}
          bands={bands}
          detail={detail}
          onClose={() => setDetail(null)}
          onOpen={setDetail}
          onChange={change}
          onToggleTool={(id) => change({ tools: toggle(state.tools, id) })}
          onAddTools={(ids) => change({ tools: add(state.tools, ...ids) })}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { computeGaps, projectGaps, stackBands } from "@compile";
import type { RenderModel, RenderTool } from "@compile";
import { DetailPanel } from "./components/Detail";
import { FilterRow } from "./components/FilterRow";
import { GapList } from "./components/GapList";
import { Legend } from "./components/Legend";
import { LensMatrix } from "./components/LensMatrix";
import { StackPanel } from "./components/StackPanel";
import { StageStrip } from "./components/StageStrip";
import { buildLookup } from "./lookup";
import { useRenderModel } from "./model";
import { add, emptyState, parseState, serializeState, toggle } from "./state";
import type { StackState } from "./state";
import type { Detail } from "./types";

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
  return <Builder model={loaded.model} />;
}

export function Builder({ model }: { model: RenderModel }) {
  const lookup = useMemo(() => buildLookup(model), [model]);
  const [state, setState] = useState<StackState>(() => parseState(window.location.search, model));
  const [detail, setDetail] = useState<Detail | null>(null);

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

  const change = (patch: Partial<StackState>) => setState((s) => ({ ...s, ...patch }));

  const report = useMemo(() => computeGaps(model, { tools: state.tools, needs: state.needs }), [model, state.tools, state.needs]);
  const lens = model.lenses.find((l) => l.id === state.lens) ?? model.lenses[0]!;
  const placement = useMemo(() => projectGaps(model, lens.id, report.gaps), [model, lens.id, report.gaps]);
  const bands = useMemo(() => stackBands(model, lens.id, state.tools), [model, lens.id, state.tools]);
  const tools = useMemo(() => state.tools.map((id) => lookup.tool(id)).filter((t): t is RenderTool => !!t), [state.tools, lookup]);

  const canReset = state.tools.length > 0 || state.needs.length > 0;

  return (
    <div className="app">
      <header className="top">
        <h1>Data stack builder</h1>
        <p className="lede">Pick the tools you use. See what your stack covers, what it is missing, and how much each gap matters. Every claim opens to its score, its note and its source.</p>
      </header>

      <FilterRow model={model} state={state} onChange={change} canReset={canReset} onReset={() => { setState(emptyState(model)); setDetail(null); }} />

      <div className="layout">
        <aside className="side" aria-label="Build your stack">
          <StackPanel model={model} lookup={lookup} state={state} onChange={change} onOpenTool={(id) => setDetail({ kind: "tool", id })} />
        </aside>

        <main className="main">
          <section aria-labelledby="coverage">
            <h2 id="coverage">Coverage by stage</h2>
            <StageStrip model={model} lookup={lookup} report={report} />
          </section>

          <section aria-labelledby="where">
            <h2 id="where">Where your tools sit</h2>
            <p className="muted">
              {lens.name}. Each row is a tool; the mark shows where it is strongest and how well it covers each zone.
            </p>
            <LensMatrix model={model} lookup={lookup} lens={lens} tools={tools} placement={placement} bands={bands} view={state.view} onOpen={setDetail} />
            <Legend model={model} />
          </section>

          <section aria-labelledby="missing">
            <h2 id="missing">What’s missing</h2>
            <GapList model={model} lookup={lookup} lens={lens} gaps={report.gaps} placement={placement} hasTools={state.tools.length > 0} onOpen={(id) => setDetail({ kind: "gap", id })} />
          </section>
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

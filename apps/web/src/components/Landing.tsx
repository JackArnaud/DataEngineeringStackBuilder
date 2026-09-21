import { useMemo, useState } from "react";
import type { RenderModel, RenderTool } from "@compile";
import { ExampleGallery } from "./ExampleGallery";
import type { Example } from "../examples";
import { listNames, plural } from "../labels";
import type { Lookup } from "../lookup";
import { CLOUDS, NEED_CARDS, cardIsOn, TOOL_STEPS } from "../landing";
import type { NeedCard, ToolStep } from "../landing";
import { add, toggle } from "../state";
import type { StackState } from "../state";

interface Props {
  model: RenderModel;
  lookup: Lookup;
  state: StackState;
  onChange: (patch: Partial<StackState>) => void;
  /** Leave the guided start and show the builder, with whatever has been chosen. */
  onDone: () => void;
  onLoadExample: (example: Example) => void;
}

type Screen =
  | { kind: "tools"; key: string; step: ToolStep }
  | { kind: "cloud"; key: string; cloud: RenderTool }
  | { kind: "needs"; key: string }
  | { kind: "review"; key: string };

type Place = "welcome" | "examples" | number;

/**
 * A run of choice screens before any guidance: pick an example, or build a stack one question at a
 * time. Choices land in the same state the builder reads, so nothing is lost when it opens.
 */
export function Landing({ model, lookup, state, onChange, onDone, onLoadExample }: Props) {
  const [place, setPlace] = useState<Place>("welcome");
  const portfolios = useMemo(() => CLOUDS.map((id) => lookup.tool(id)).filter((t): t is RenderTool => !!t), [lookup]);
  // A cloud is chosen when its tile is ticked or one of its services is already in the stack.
  const [chosen, setChosen] = useState<string[]>(() => portfolios.filter((p) => p.includes?.some((s) => state.tools.includes(s))).map((p) => p.id));

  const flow: Screen[] = useMemo(() => {
    const screens: Screen[] = [];
    for (const step of TOOL_STEPS) {
      screens.push({ kind: "tools", key: step.id, step });
      if (step.id === "platform") for (const p of portfolios) if (chosen.includes(p.id)) screens.push({ kind: "cloud", key: `cloud-${p.id}`, cloud: p });
    }
    screens.push({ kind: "needs", key: "needs" }, { kind: "review", key: "review" });
    return screens;
  }, [chosen, portfolios]);

  const selected = new Set(state.tools);
  const stepOf = (n: number) => `Step ${n + 1} of ${flow.length}`;

  if (place === "welcome") {
    return (
      <section className="landing" aria-labelledby="welcome">
        <h2 id="welcome">How would you like to start?</h2>
        <p className="muted">Either way, you get a plain account of what your stack covers, what it is missing, and why each gap matters.</p>
        <ul className="choices">
          <li>
            <button type="button" className="choice" onClick={() => setPlace("examples")}>
              <span className="choice__title">Start from an example</span>
              <span className="choice__body">See a stack people really build, load it, and change it. The quickest way to see how this works.</span>
            </button>
          </li>
          <li>
            <button type="button" className="choice" onClick={() => setPlace(0)}>
              <span className="choice__title">Build my own</span>
              <span className="choice__body">Answer a few short questions about what you use and what you need. Skip any you like.</span>
            </button>
          </li>
        </ul>
        <button type="button" className="linkish" onClick={onDone}>
          I know what I use: go straight to the builder
        </button>
      </section>
    );
  }

  if (place === "examples") {
    return (
      <section className="landing">
        <ExampleGallery lookup={lookup} onLoad={onLoadExample} />
        <div className="landing__nav">
          <button type="button" className="secondary" onClick={() => setPlace("welcome")}>
            Back
          </button>
        </div>
      </section>
    );
  }

  const screen = flow[Math.min(place, flow.length - 1)]!;
  const isLast = place === flow.length - 1;
  const go = (n: number) => setPlace(n < 0 ? "welcome" : n);

  const pickedHere =
    screen.kind === "tools"
      ? screen.step.tiles.filter((id) => selected.has(id)).length + (screen.step.id === "platform" ? chosen.length : 0)
      : screen.kind === "cloud"
        ? (screen.cloud.includes ?? []).filter((id) => selected.has(id)).length
        : screen.kind === "needs"
          ? NEED_CARDS.filter((c) => cardIsOn(c, state.needs)).length
          : 0;

  return (
    <section className="landing" aria-labelledby="step-title">
      <p className="landing__progress" aria-live="polite">
        {stepOf(place)}
      </p>

      {screen.kind === "tools" && (
        <>
          <h2 id="step-title">{screen.step.title}</h2>
          <p className="muted">{screen.step.help}</p>
          <ul className="tiles">
            {screen.step.tiles.map((id) => (
              <ToolTile key={id} tool={lookup.tool(id)} on={selected.has(id)} onToggle={() => onChange({ tools: toggle(state.tools, id) })} />
            ))}
            {screen.step.id === "platform" &&
              portfolios.map((p) => (
                <Tile
                  key={p.id}
                  name={p.name}
                  blurb="Assemble it from services. You will pick which ones next."
                  on={chosen.includes(p.id)}
                  onToggle={() => setChosen((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                />
              ))}
          </ul>
        </>
      )}

      {screen.kind === "cloud" && (
        <>
          <h2 id="step-title">Which {screen.cloud.name} services do you use?</h2>
          <p className="muted">These are the data services scored for {screen.cloud.name}. Pick the ones you run.</p>
          <div className="tiles__actions">
            <button type="button" className="linkish" onClick={() => onChange({ tools: add(state.tools, ...(screen.cloud.includes ?? [])) })}>
              Select all {screen.cloud.includes?.length}
            </button>
            <button type="button" className="linkish" onClick={() => onChange({ tools: state.tools.filter((t) => !screen.cloud.includes?.includes(t)) })}>
              Clear
            </button>
          </div>
          <ul className="tiles">
            {(screen.cloud.includes ?? []).map((id) => (
              <ToolTile key={id} tool={lookup.tool(id)} on={selected.has(id)} onToggle={() => onChange({ tools: toggle(state.tools, id) })} />
            ))}
          </ul>
        </>
      )}

      {screen.kind === "needs" && (
        <>
          <h2 id="step-title">What does it need to do?</h2>
          <p className="muted">Tick what matters. Anything you tick that your tools cannot do is flagged first. Skip this to see what your tools cover on their own.</p>
          <ul className="tiles">
            {NEED_CARDS.map((card) => (
              <NeedTile key={card.id} card={card} on={cardIsOn(card, state.needs)} onToggle={() => onChange({ needs: cardIsOn(card, state.needs) ? state.needs.filter((n) => !card.needs.includes(n)) : add(state.needs, ...card.needs) })} />
            ))}
          </ul>
        </>
      )}

      {screen.kind === "review" && (
        <>
          <h2 id="step-title">Here is your stack</h2>
          {state.tools.length === 0 && state.needs.length === 0 ? (
            <p className="muted">You have not picked anything yet. You can still continue and pick tools in the builder, or go back and choose some.</p>
          ) : (
            <>
              <p className="muted">
                {plural(state.tools.length, "tool")}
                {state.needs.length > 0 && ` and ${plural(state.needs.length, "need")}`}. Next: what they cover, what they leave open, and why each gap matters.
              </p>
              {state.tools.length > 0 && <p className="review__line">{listNames(state.tools.map((id) => lookup.toolName(id)))}</p>}
              {state.needs.length > 0 && (
                <p className="review__line">
                  <span className="muted">You need </span>
                  {listNames(state.needs.map((id) => lookup.capabilityName(id)))}
                </p>
              )}
            </>
          )}
        </>
      )}

      <div className="landing__nav">
        <button type="button" className="secondary" onClick={() => go(place - 1)}>
          Back
        </button>
        <button type="button" className="primary" onClick={isLast ? onDone : () => go(place + 1)}>
          {isLast ? "Show me what's missing" : pickedHere === 0 ? "Skip" : "Next"}
        </button>
      </div>
    </section>
  );
}

function Tile({ name, blurb, on, onToggle }: { name: string; blurb?: string; on: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="tile" data-on={on}>
        <input type="checkbox" checked={on} onChange={onToggle} />
        <span className="tile__name">{name}</span>
        {blurb && <span className="tile__blurb">{blurb}</span>}
      </label>
    </li>
  );
}

function ToolTile({ tool, on, onToggle }: { tool: RenderTool | undefined; on: boolean; onToggle: () => void }) {
  if (!tool) return null;
  const parts = tool.kind === "bundle" ? ` A suite of ${tool.includes?.length} parts.` : "";
  return <Tile name={tool.name} blurb={`${tool.tagline ?? ""}${parts}`.trim()} on={on} onToggle={onToggle} />;
}

function NeedTile({ card, on, onToggle }: { card: NeedCard; on: boolean; onToggle: () => void }) {
  return <Tile name={card.label} blurb={card.help} on={on} onToggle={onToggle} />;
}

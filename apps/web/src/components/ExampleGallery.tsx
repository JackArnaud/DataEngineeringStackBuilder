import { EXAMPLE_GROUPS } from "../examples";
import type { Example } from "../examples";
import { listNames } from "../labels";
import type { Lookup } from "../lookup";

interface Props {
  lookup: Lookup;
  onLoad: (example: Example) => void;
}

/**
 * Example stacks people really run, for someone who has not picked anything yet. Each says what it is
 * and what to look at once loaded, so the tool teaches by showing rather than by explaining.
 */
export function ExampleGallery({ lookup, onLoad }: Props) {
  return (
    <section aria-labelledby="examples" className="examples-gallery">
      <h2 id="examples">Start from an example</h2>
      <p className="muted">Each is a stack people really build. Load one, then swap tools in and out.</p>
      {EXAMPLE_GROUPS.map((group) => (
        <div key={group.title} className="exgroup">
          <h3>{group.title}</h3>
          <p className="muted exgroup__about">{group.about}</p>
          <ul className="excards">
            {group.examples.map((e) => (
              <li key={e.label} className="excard">
                <div className="excard__main">
                  <h4 className="excard__title">{e.label}</h4>
                  <p className="excard__hint">{e.hint}</p>
                  <p className="excard__tools">
                    <span className="muted">Uses </span>
                    {listNames(e.tools.map((id) => lookup.toolName(id)))}
                    {e.needs && e.needs.length > 0 && (
                      <>
                        <span className="muted">. You need </span>
                        {listNames(e.needs.map((id) => lookup.capabilityName(id)))}
                      </>
                    )}
                    <span className="muted">.</span>
                  </p>
                  <details className="fold">
                    <summary>What to look at</summary>
                    <p className="excard__notice">{e.notice}</p>
                  </details>
                </div>
                <button type="button" className="primary" aria-label={`Load ${e.label}`} onClick={() => onLoad(e)}>
                  Load this stack
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

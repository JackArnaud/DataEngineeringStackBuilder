import { useCallback, useEffect, useState } from "react";
import type { RenderModel } from "@compile";

export type ModelState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; model: RenderModel };

function assertRenderModel(data: unknown): RenderModel {
  const m = data as Partial<RenderModel> | null;
  if (!m || m.format !== "render-model" || m.format_version !== 1) {
    throw new Error("The data file is not a render model this version of the site understands.");
  }
  return m as RenderModel;
}

/** Load the render model, the only data the site reads. Returns a retry function for the error state. */
export function useRenderModel(url: string): [ModelState, () => void] {
  const [state, setState] = useState<ModelState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
        return res.json() as Promise<unknown>;
      })
      .then((data) => setState({ status: "ready", model: assertRenderModel(data) }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Could not load the data." });
      });
    return () => controller.abort();
  }, [url, attempt]);

  return [state, useCallback(() => setAttempt((n) => n + 1), [])];
}

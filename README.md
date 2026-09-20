# Data stack builder

A site for choosing data tools and seeing what your stack covers and what it is missing, ranked by
how much each gap matters. Every claim on screen opens to the score, the note and the source link
behind it.

The design is in [data-tooling-visualiser-brief.md](data-tooling-visualiser-brief.md). Where the
implementation extends or departs from it, and what is not enforced yet, is in
[docs/design-decisions.md](docs/design-decisions.md). What is next is in [docs/backlog.md](docs/backlog.md).

## Run it

Needs Node 22.12 or newer (`.nvmrc` pins 24).

```
npm install
npm run dev        # compiles the data, then serves the site with hot reload
npm run ci         # typecheck, tests, data validation, production build: what CI runs
```

| Script | What it does |
|---|---|
| `npm run validate` | Checks every data file against its schema and the cross-file rules. Fails on any error. |
| `npm run compile` | Validates, then writes `apps/web/public/render-model.json`, the only thing the site reads. |
| `npm run dev` / `build` / `preview` | The site. `build` writes static files to `dist/web`. |
| `npm test` | All tests, including the golden files. `UPDATE_GOLDEN=1 npm test` regenerates them after an intended change. |

## How it fits together

```
data/                    facts: taxonomy, tool records, lenses, derivation rules (JSON, with schemas)
packages/compile/        validate -> derive -> project -> render-model.json, plus the gap engine
apps/web/                the site: reads render-model.json, holds no view logic of its own
```

- **Facts are scored and sourced.** A tool record scores each capability 1 to 3 with a note and a
  source URL. Absence means 0.
- **Lenses reproject the same facts** (audit grid, medallion) without changing them.
- **Bundles and portfolios are never hand-scored.** Their coverage derives from their parts.
- **Gaps never depend on a lens.** A lens only decides where a gap is drawn, and CI rejects any lens
  that could hide one.
- **The address is the state.** Copy the link and someone else sees the same stack.

## Adding a tool

1. Add `data/tools/<vendor>/<id>.json`, with the file name equal to the record `id`.
2. Score only what a documentation page you have read supports, and put that page in `source`.
3. `npm run validate`. It tells you the file, the path and the rule for anything wrong.
4. `npm test` and check the golden diff is only what you expect.

A capability the taxonomy cannot express goes in `proposed_capabilities`, never into the nearest
existing ID.

## Hosting

The build is plain static files, so moving host is a deploy-step change. Set `BASE_PATH` to the URL
prefix the site is served under (`/` for a custom domain, `/<repo>/` for a GitHub Pages project
page). `.github/workflows/deploy.yml` deploys to GitHub Pages and is manual until Pages is enabled.

# Computational Experimentation

Private Aeronauty long-form essay package.

## Source of truth

The prose lives in the Google Doc, not in this directory:

- Document: `1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs`
- Tab: `t.0`
- URL: <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`article-source.md` and `source-metadata.json` are generated derivatives. Do not hand-edit the prose snapshot. `article.html` owns only presentation and reads the snapshot at runtime.

## Sync and validate

The sync script uses Application Default Credentials through the site’s existing `googleapis` dependency. The authenticated principal must be able to read the Doc.

```bash
cd aeronauty-site
npm run sync:computational-experimentation
npm run test:computational-experimentation
```

That workflow:

1. reads the authoritative Google Doc and tab;
2. writes `article-source.md` plus revision metadata;
3. validates the marker contract and article shell;
4. runs the numerical acceptance tests used by the visible vortex demonstrations.

For local user credentials, `gcloud auth application-default login` is the simplest route. CI does not need Doc credentials because it validates the committed snapshot rather than silently pulling mutable prose.

## Editorial markers

The runtime renderer turns the editor’s markers into article components:

- `[<callout>... ]` → interactive asterisk aside;
- `[<put this in a little side callout>... ]` → wider side aside;
- the five panel/wake instructions → the corresponding interactive calibration instruments;
- `[<Show the page of my dissertation.>]` → an explicitly labelled schematic until the archival page is supplied;
- `— — —` → a styled section boundary.

Unrecognised top-level `[<...>]` instructions render as visible errors rather than disappearing.

## Numerical trust case

`article.html` and `test-vortex-core.mjs` use `vortex-core.js`. The test checks:

- the canonical unit-panel result;
- closed form against independent midpoint quadrature;
- vector superposition;
- closure of discrete trailing-circulation jumps;
- Kelvin balance between bound and shed circulation.

This is deliberate: the demonstration and the automated check are two views of the same primitive.

## Private preview

The package is served by the existing gated topology-article asset route and registered in private writing at:

`/lab/articles/computational-experimentation`

It is not added to the public writing index.

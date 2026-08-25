# Computational Experimentation

Private Aeronauty long-form essay package.

## Source of truth

The prose lives in the Google Doc, not in this directory:

- Document: `1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs`
- Tab: `t.0`
- URL: <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`source.generated.txt` and `source.json` are generated derivatives. Do not edit the prose snapshot by hand as a normal authoring workflow. `article.html` is a stable article shell; `render-source.js` turns the synchronised prose and its editorial markers into the actual article at runtime.

That split is deliberate: prose changes happen in Docs; article presentation, callouts and numerical instruments live here.

## Sync, build and test

The sync script uses Application Default Credentials through the existing `googleapis` dependency. The authenticated principal must be able to read the Doc.

```bash
cd aeronauty-site/content/private/topology-instinct/computational-experimentation
npm run sync
npm test
```

`npm run sync`:

1. reads the authoritative Google Doc and selected tab;
2. writes a normalised text snapshot and revision metadata;
3. rewrites the stable article shell.

Useful individual commands:

```bash
npm run build
npm run check
node test-vortex-core.mjs
node test-calibration.mjs
```

For local user credentials, `gcloud auth application-default login` is the simplest route. CI can use a service account whose email has been granted read access to the Doc.

## Editorial markers

The runtime renderer turns the prose editor's markers into article components:

- `[<callout>... ]` → interactive asterisk aside;
- `[<put this in a little side callout>... ]` → a wider side aside;
- the five panel/wake instructions → five modes of the shared calibration bench;
- `[<Show the page of my dissertation.>]` → `figures/peters-he-dissertation.png` when present.

The dissertation page is intentionally not fabricated. Until that source image is supplied, the private preview shows a clearly labelled asset gap.

## Numerical trust case

`vortex-core.js` / `calibration-core.mjs` are used by the browser figures and the automated checks. The tests cover:

- a canonical finite-vortex-segment Biot–Savart case;
- closed-form influence against numerical quadrature;
- vector superposition;
- trailing-vorticity strength bookkeeping;
- shed/bound circulation balance;
- Theodorsen reference anchors generated from the Hankel-function definition.

This is deliberate: the demonstration and the automated check are two views of the same primitive.

## Private preview

The package is served through the existing gated topology-article asset route and is registered only in the private article list:

`/lab/articles/computational-experimentation`

It is not added to the public writing registry by this branch.

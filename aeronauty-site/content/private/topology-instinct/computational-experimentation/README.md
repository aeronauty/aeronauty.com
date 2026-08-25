# Computational Experimentation

Private Aeronauty long-form essay package.

## Source of truth

The prose lives in the Google Doc, not in this directory:

- Document: `1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs`
- Tab: `t.0`
- URL: <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`source.generated.txt`, `source.json`, and `article.html` are generated derivatives. Do not hand-edit the generated source snapshot or the built HTML.

## Sync and build

The sync script uses Application Default Credentials through the existing `googleapis` dependency. The authenticated principal must be able to read the Doc.

```bash
cd aeronauty-site
npm run sync:computational-experimentation
```

That command:

1. reads the authoritative Google Doc and selected tab;
2. writes a normalized text snapshot and revision metadata;
3. rebuilds `article.html`.

Useful local commands:

```bash
npm run build:computational-experimentation
npm run test:computational-experimentation
node content/private/topology-instinct/computational-experimentation/build_article.mjs --check
```

For local user credentials, `gcloud auth application-default login` is the simplest route. CI can use a service account whose email has been granted read access to the Doc.

## Editorial markers

The renderer turns the prose editor's markers into article components:

- `[<callout>... ]` → interactive asterisk aside.
- `[<put this in a little side callout>... ]` → wider side aside.
- The five panel/wake instructions → modes of the shared calibration bench.
- `[<Show the page of my dissertation.>]` → `figures/peters-he-dissertation.png` when present.

The dissertation page is intentionally not fabricated. Until that source image is supplied, the private preview shows a clearly labelled asset gap.

## Numerical trust case

`calibration-core.mjs` is imported by both the interactive figure and `test-calibration.mjs`. The tests cover:

- a canonical finite-vortex-segment Biot–Savart case;
- vector superposition;
- trailing-vorticity strength bookkeeping;
- shed/bound circulation balance;
- exact Theodorsen reference anchors generated from the Hankel-function definition.

This is deliberate: the demonstration and the automated check are two views of the same primitive.

## Private preview

The package is served through the existing gated topology-article asset route. Once the draft branch is deployed, open:

`/lab/articles/computational-experimentation`

The article is registered as a private draft only; it is not added to the public writing index by this package.

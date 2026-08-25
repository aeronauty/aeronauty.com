# Computational Experimentation article package

This is the private AeroNauty long-form preview for **Computational Experimentation**.

## Source of truth

The prose lives in the Google Doc:

- Document ID: `1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs`
- URL: <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`article-source.md` is a generated deployment snapshot. Do not edit its prose by hand. Presentation belongs in the repository: callout rendering, figures, widgets, CSS and private-preview registration.

The article loads that snapshot directly in the browser. There is no second prose copy hidden inside `article.html`.

## Sync the prose

With Google credentials that can read the Doc:

```bash
GOOGLE_DOCS_ACCESS_TOKEN=... npm run sync:computational-experimentation
```

Or from a Markdown export:

```bash
node scripts/sync-computational-experimentation.mjs \
  --input "/path/to/Computational Experimentation.md" \
  --revision "<Google Docs revision id>" \
  --modified "<Drive modified time>"
```

The sync writes `article-source.md` and `source-metadata.json`. `article.css`, `article-renderer.mjs`, `article.js` and `vortex-core.js` are repository-owned presentation and behaviour sources.

## Marker contract

The Doc deliberately contains a small amount of presentation markup:

- `[<callout>... ]` — inline AeroNauty asterisk aside.
- `[<put this in a little side callout>... ]` — featured aside.
- Whole-paragraph `[<insert widget ...>]` instructions — interactive figures.
- `— — —` — section boundary; the site supplies headings and standfirsts.

Unknown whole-paragraph markers become visible editorial warnings in the private preview rather than silently disappearing.

## Acceptance tests

```bash
npm run test:computational-experimentation
```

The browser and Node test use the same `vortex-core.js` UMD module. Tests cover the closed-form vortex-panel kernel against independent midpoint quadrature, the canonical unit-panel answer, superposition, trailing-circulation closure and equal-and-opposite shed circulation. A second test checks that all five Google Doc widget instructions resolve.

## Publication state

The article is registered only in `/lab/writing`. Publishing it publicly is a separate, deliberate change.

## One honest placeholder

The connected Drive did not contain the original dissertation page referenced in the prose. The preview uses a clearly labelled schematic reconstruction. Replace it with the original page when that source asset is available; do not present the reconstruction as an archival scan.

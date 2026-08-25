# Computational Experimentation article package

This is the private AeroNauty long-form build for **Computational Experimentation**.

## Source of truth

The prose lives in the Google Doc:

- Document ID: `1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs`
- URL: <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`article-source.md` is a generated snapshot. Do not edit its prose by hand.
Presentation belongs in the repository: callout rendering, figures, widgets, CSS,
and the private preview registration.

## Sync the prose

With a Google OAuth access token that can read the Doc:

```bash
GOOGLE_DOCS_ACCESS_TOKEN=... npm run sync:computational-experimentation
```

Or from a Markdown export:

```bash
node scripts/sync-computational-experimentation.mjs \
  --input "/path/to/Computational Experimentation.md"
```

The npm sync command runs two steps:

1. `sync-computational-experimentation.mjs` exports the Doc to `article-source.md` and updates `source-metadata.json`.
2. `build-computational-experimentation.mjs` assembles `article.html` from that snapshot and the repository-owned presentation code.

`article.css`, `article.js` and `vortex-core.js` are presentation/behaviour
sources and are not generated from the Doc.

## Numerical acceptance test

```bash
npm run test:computational-experimentation
```

The browser widgets and the test import the same `vortex-core.js` module. The
acceptance test covers:

- the closed-form constant-strength vortex-panel kernel against independent
  midpoint Biot–Savart quadrature;
- the canonical horizontal unit-panel result;
- superposition;
- trailing-circulation closure; and
- equal-and-opposite shed circulation.

The deploy build runs this test before `next build`, so the sentence in the
essay about the same primitive running in continuous integration is literal.

## Publication state

The article is registered only in the private `/lab/writing` area. Publishing
it publicly is a separate, deliberate change.

## One honest placeholder

The connected Drive did not contain the original dissertation page referenced
in the prose. The current article uses a clearly labelled schematic
reconstruction; replace that slot with the original page when the source asset
is available. It must not be presented as an archival scan until then.

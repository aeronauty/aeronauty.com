# Computational Experimentation — article package

This package renders the private AeroNauty long-form preview for **Computational Experimentation**.

## Source-of-truth rule

The prose lives in this Google Doc and nowhere else:

- <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`source-snapshot.txt` is generated. Do not edit it as prose. Repository code owns article chrome, layout, callout behaviour, interactive demonstrations, tests and build mechanics.

## Sync and build

From `aeronauty-site/`:

```bash
npm run sync:computational-experimentation
npm run test:computational-experimentation
```

The sync script accepts `GOOGLE_DOCS_ACCESS_TOKEN` or Application Default Credentials supported by `googleapis`. The build fails if the six divider-delimited sections stop matching the article map.

## Marker contract in the Google Doc

- `[<callout>...text...]` — inline asterisk aside.
- `[<put this in a little side callout>...text...]` — same renderer; the longer name is retained for conversational drafting.
- Recognised top-level `[<...>]` instructions become article components.
- `[<fact-check ...>]` is omitted from prose and surfaced as a build/publication warning.
- `— — —` is a section boundary. The inserted section heading is article chrome, not prose.

## Numerical trust claim

`article.js` and `test-vortex-core.mjs` import the same `vortex-core.js` module. The visible demonstrations and CI test therefore share the numerical primitives. Tests cover:

- finite-segment closed form against independent Biot–Savart quadrature;
- explicit superposition;
- closure of discrete trailing-circulation jumps;
- Kelvin balance between bound and shed circulation.

## Publication blocker

The connected Drive search did not contain the original dissertation page. The draft uses a clearly labelled reconstruction and must be swapped for the real page before publication.

The article is registered as a **Draft** in private writing only. It is not on the public `/writing` index.

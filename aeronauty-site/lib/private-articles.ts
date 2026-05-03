/**
 * Private longform articles served via /lab/articles/[slug].
 *
 * These differ from the simpler /lab/writing/[slug] posts in that they
 * are pre-rendered by an external build pipeline (build_article.py)
 * into self-contained HTML files with embedded interactive figures
 * (iframes, KaTeX, d3, Plotly, globe.gl, custom IIFEs). Rather than
 * try to pull all that through React, we iframe the built HTML inside
 * the gated lab page and serve assets through a sibling Route Handler.
 *
 * The source files live under content/private/topology-instinct/ and
 * the gated asset route exposes them at
 * /lab/articles/topology-instinct/assets/[...path].
 */
export type PrivateArticle = {
  slug: string;
  title: string;
  description: string;
  date: string;
  status: string;
  tags: string[];
  /** Filename inside the article package's build root, served via the
   *  gated asset route. e.g. "article-1.html" → resolved to
   *  /lab/articles/topology-instinct/assets/article-1.html */
  buildFile: string;
  /** Asset-route prefix (mostly here for forward-compatibility if more
   *  packages are added later). */
  assetPrefix: string;
};

export const privateArticles: PrivateArticle[] = [
  {
    slug: "i-dont-like-data-entry",
    title: "I Don't Like Data Entry",
    description:
      "Twenty years of avoiding the human join operation — from PDF figures and PowerPoint refusals through Paradigm and Postgres to Flexcompute Thread.",
    date: "2026-05-03",
    status: "Draft",
    tags: ["Topology", "Thread", "Engineering data", "Long read"],
    buildFile: "article-1.html",
    assetPrefix: "/lab/articles/topology-instinct/assets",
  },
  {
    slug: "the-brain-that-was-a-tax",
    title: "The Brain That Was a Tax Is Now an Asset",
    description:
      "ADHD, medication, and a swarm of cheap fast specialists arriving roughly at the same time — and what happened to the cross-domain generalist when they did.",
    date: "2026-05-03",
    status: "Draft",
    tags: ["ADHD", "AI", "Orchestration", "Long read"],
    buildFile: "article-2.html",
    assetPrefix: "/lab/articles/topology-instinct/assets",
  },
];

export function getPrivateArticle(slug: string): PrivateArticle | undefined {
  return privateArticles.find((a) => a.slug === slug);
}

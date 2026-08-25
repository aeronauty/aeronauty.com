import { topologyArticles } from "@/lib/topology-articles";

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

const computationalExperimentation: PrivateArticle = {
  slug: "computational-experimentation",
  title: "Computational Experimentation",
  description:
    "What changes when engineering code becomes cheap to produce, but trust still has to be earned one known case at a time.",
  date: "2026-08-25",
  status: "Draft",
  tags: ["Aerodynamics", "AI", "Verification", "Interactive"],
  buildFile: "computational-experimentation/article.html",
  assetPrefix: "/lab/articles/topology-instinct/assets",
};

export const privateArticles: PrivateArticle[] = [
  ...topologyArticles.map((article) => ({
    slug: article.slug,
    title: article.title,
    description: article.description,
    date: article.date,
    status: article.status,
    tags: article.tags,
    buildFile: article.buildFile,
    assetPrefix: article.labAssetPrefix,
  })),
  computationalExperimentation,
];

export function getPrivateArticle(slug: string): PrivateArticle | undefined {
  return privateArticles.find((a) => a.slug === slug);
}

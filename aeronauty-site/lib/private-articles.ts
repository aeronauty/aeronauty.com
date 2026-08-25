import { topologyArticles } from "@/lib/topology-articles";

export type PrivateArticle = {
  slug: string;
  title: string;
  description: string;
  date: string;
  status: string;
  tags: string[];
  /** Filename or nested path inside the topology-instinct article package,
   *  served through the gated asset route. */
  buildFile: string;
  /** Asset-route prefix for the package containing buildFile. */
  assetPrefix: string;
};

const topologyPrivateArticles: PrivateArticle[] = topologyArticles.map((article) => ({
  slug: article.slug,
  title: article.title,
  description: article.description,
  date: article.date,
  status: article.status,
  tags: article.tags,
  buildFile: article.buildFile,
  assetPrefix: article.labAssetPrefix,
}));

export const privateArticles: PrivateArticle[] = [
  ...topologyPrivateArticles,
  {
    slug: "computational-experimentation",
    title: "Computational Experimentation",
    description:
      "What changes when engineering code becomes cheap to produce, but trust still has to be earned against known physical behaviour.",
    date: "2026-08-25",
    status: "Draft",
    tags: ["Computational aerodynamics", "AI", "Verification", "Interactive"],
    buildFile: "computational-experimentation/article.html",
    assetPrefix: "/lab/articles/topology-instinct/assets",
  },
];

export function getPrivateArticle(slug: string): PrivateArticle | undefined {
  return privateArticles.find((a) => a.slug === slug);
}

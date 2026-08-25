import { topologyArticles } from "@/lib/topology-articles";

export type PrivateArticle = {
  slug: string;
  title: string;
  description: string;
  date: string;
  status: string;
  tags: string[];
  buildFile: string;
  assetPrefix: string;
};

const standalonePrivateArticles: PrivateArticle[] = [
  {
    slug: "computational-experimentation",
    title: "Computational Experimentation",
    description:
      "Moving trust in machine-produced engineering work from authorship to experiment, with the panel-code calibration sequence made interactive.",
    date: "2026-08-25",
    status: "Draft",
    tags: ["Engineering", "AI", "Verification", "Interactive", "Long read"],
    buildFile: "article.html",
    assetPrefix: "/lab/computational-experimentation/assets",
  },
];

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
  ...standalonePrivateArticles,
];

export function getPrivateArticle(slug: string): PrivateArticle | undefined {
  return privateArticles.find((article) => article.slug === slug);
}
